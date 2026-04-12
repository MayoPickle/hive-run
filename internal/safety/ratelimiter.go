package safety

import (
	"context"
	"sync"
	"time"
)

type RateLimiter struct {
	tokens    chan struct{}
	stop      chan struct{}
	done      chan struct{}
	closeOnce sync.Once
}

func NewRateLimiter(qps int) *RateLimiter {
	if qps <= 0 {
		return &RateLimiter{}
	}

	interval := time.Second / time.Duration(qps)
	if interval <= 0 {
		interval = time.Nanosecond
	}

	limiter := &RateLimiter{
		tokens: make(chan struct{}, 1),
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
	}

	go func() {
		defer close(limiter.done)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		select {
		case limiter.tokens <- struct{}{}:
		default:
		}

		for {
			select {
			case <-limiter.stop:
				return
			case <-ticker.C:
				select {
				case limiter.tokens <- struct{}{}:
				default:
				}
			}
		}
	}()

	return limiter
}

func (r *RateLimiter) Wait(ctx context.Context) error {
	if r.tokens == nil {
		return nil
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-r.tokens:
		return nil
	}
}

func (r *RateLimiter) Close() {
	if r.stop == nil {
		return
	}

	r.closeOnce.Do(func() {
		close(r.stop)
		<-r.done
	})
}
