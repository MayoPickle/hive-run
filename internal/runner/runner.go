package runner

import (
	"context"
	"sync"
	"time"

	"hive-run/internal/httpclient"
	"hive-run/internal/metrics"
	"hive-run/internal/safety"
)

type Requester interface {
	Do(context.Context) httpclient.Result
}

type Breaker interface {
	Evaluate(metrics.Totals) safety.Evaluation
}

type Waiter interface {
	Wait(context.Context) error
}

type Options struct {
	Duration       time.Duration
	MaxConcurrency int
	RampUp         time.Duration
}

type Result struct {
	Snapshot     metrics.Snapshot
	StoppedEarly bool
	StopReason   string
}

type Runner struct {
	options          Options
	requester        Requester
	requesterFactory func(workerID int) Requester
	collector        *metrics.Collector
	breaker          Breaker
	limiter          Waiter
}

func New(options Options, requester Requester, collector *metrics.Collector, breaker Breaker, limiter Waiter) *Runner {
	return &Runner{
		options:   options,
		requester: requester,
		collector: collector,
		breaker:   breaker,
		limiter:   limiter,
	}
}

func NewWithFactory(options Options, factory func(int) Requester, collector *metrics.Collector, breaker Breaker, limiter Waiter) *Runner {
	return &Runner{
		options:          options,
		requesterFactory: factory,
		collector:        collector,
		breaker:          breaker,
		limiter:          limiter,
	}
}

func (r *Runner) Run(ctx context.Context) (Result, error) {
	if r.collector == nil {
		r.collector = metrics.NewCollector(time.Now())
	}

	runCtx, cancel := context.WithTimeout(ctx, r.options.Duration)
	defer cancel()

	var (
		wg         sync.WaitGroup
		stopOnce   sync.Once
		stopReason string
	)

	setStop := func(reason string) {
		stopOnce.Do(func() {
			stopReason = reason
			cancel()
		})
	}

	for workerID := 0; workerID < r.options.MaxConcurrency; workerID++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			req := r.requester
			if r.requesterFactory != nil {
				req = r.requesterFactory(id)
			}
			delay := workerStartDelay(id, r.options.MaxConcurrency, r.options.RampUp)
			if delay > 0 {
				timer := time.NewTimer(delay)
				defer timer.Stop()
				select {
				case <-runCtx.Done():
					return
				case <-timer.C:
				}
			}

			for {
				if runCtx.Err() != nil {
					return
				}

				if r.limiter != nil {
					if err := r.limiter.Wait(runCtx); err != nil {
						return
					}
				}

				result := req.Do(runCtx)
				if result.ErrorType == "canceled" && runCtx.Err() != nil {
					return
				}

				r.collector.Record(metrics.Outcome{
					Duration:   result.Duration,
					StatusCode: result.StatusCode,
					ErrorType:  result.ErrorType,
					Successful: result.Successful,
				})

				if r.breaker != nil {
					evaluation := r.breaker.Evaluate(r.collector.Totals())
					if evaluation.Tripped {
						setStop(evaluation.Reason)
						return
					}
				}
			}
		}(workerID)
	}

	wg.Wait()
	finishedAt := time.Now()

	return Result{
		Snapshot:     r.collector.Snapshot(finishedAt),
		StoppedEarly: stopReason != "",
		StopReason:   stopReason,
	}, nil
}

func workerStartDelay(workerID, maxConcurrency int, rampUp time.Duration) time.Duration {
	if workerID <= 0 || maxConcurrency <= 1 || rampUp <= 0 {
		return 0
	}

	step := rampUp / time.Duration(maxConcurrency-1)
	return time.Duration(workerID) * step
}
