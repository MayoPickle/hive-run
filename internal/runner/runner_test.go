package runner

import (
	"context"
	"testing"
	"time"

	"hive-run/internal/httpclient"
	"hive-run/internal/metrics"
	"hive-run/internal/safety"
)

type fakeRequester struct {
	fn func(context.Context) httpclient.Result
}

func (f fakeRequester) Do(ctx context.Context) httpclient.Result {
	return f.fn(ctx)
}

func TestWorkerStartDelay(t *testing.T) {
	rampUp := 3 * time.Second

	if got := workerStartDelay(0, 4, rampUp); got != 0 {
		t.Fatalf("expected first worker to start immediately, got %s", got)
	}
	if got := workerStartDelay(1, 4, rampUp); got != time.Second {
		t.Fatalf("expected second worker at 1s, got %s", got)
	}
	if got := workerStartDelay(3, 4, rampUp); got != 3*time.Second {
		t.Fatalf("expected last worker at 3s, got %s", got)
	}
}

func TestRunStopsAfterDuration(t *testing.T) {
	collector := metrics.NewCollector(time.Now())
	loadRunner := New(
		Options{
			Duration:       80 * time.Millisecond,
			MaxConcurrency: 2,
		},
		fakeRequester{
			fn: func(ctx context.Context) httpclient.Result {
				time.Sleep(5 * time.Millisecond)
				return httpclient.Result{StatusCode: 200, Duration: 5 * time.Millisecond, Successful: true}
			},
		},
		collector,
		safety.NewBreaker(0, 0, 100),
		nil,
	)

	result, err := loadRunner.Run(context.Background())
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.StoppedEarly {
		t.Fatalf("expected normal completion, got early stop: %s", result.StopReason)
	}
	if result.Snapshot.TotalRequests == 0 {
		t.Fatal("expected at least one request to be recorded")
	}
}

func TestRunStopsEarlyWhenBreakerTrips(t *testing.T) {
	collector := metrics.NewCollector(time.Now())
	loadRunner := New(
		Options{
			Duration:       time.Second,
			MaxConcurrency: 2,
		},
		fakeRequester{
			fn: func(ctx context.Context) httpclient.Result {
				time.Sleep(2 * time.Millisecond)
				return httpclient.Result{Duration: 2 * time.Millisecond, ErrorType: "timeout", Successful: false}
			},
		},
		collector,
		safety.NewBreaker(0.5, 0.4, 5),
		nil,
	)

	result, err := loadRunner.Run(context.Background())
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if !result.StoppedEarly {
		t.Fatal("expected safety breaker to stop the run early")
	}
	if result.StopReason == "" {
		t.Fatal("expected a stop reason")
	}
	if result.Snapshot.TotalRequests < 5 {
		t.Fatalf("expected breaker to wait for samples, got %d", result.Snapshot.TotalRequests)
	}
}
