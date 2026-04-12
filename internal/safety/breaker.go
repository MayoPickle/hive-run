package safety

import (
	"fmt"

	"hive-run/internal/metrics"
)

type Evaluation struct {
	Tripped bool
	Reason  string
}

type Breaker struct {
	errorRateThreshold   float64
	timeoutRateThreshold float64
	minSamples           int
}

func NewBreaker(errorRateThreshold, timeoutRateThreshold float64, minSamples int) *Breaker {
	if minSamples <= 0 {
		minSamples = 1
	}

	return &Breaker{
		errorRateThreshold:   errorRateThreshold,
		timeoutRateThreshold: timeoutRateThreshold,
		minSamples:           minSamples,
	}
}

func (b *Breaker) Evaluate(totals metrics.Totals) Evaluation {
	if totals.TotalRequests < b.minSamples {
		return Evaluation{}
	}

	if b.errorRateThreshold > 0 && totals.ErrorRate() >= b.errorRateThreshold {
		return Evaluation{
			Tripped: true,
			Reason:  fmt.Sprintf("error rate %.2f%% exceeded threshold %.2f%%", totals.ErrorRate()*100, b.errorRateThreshold*100),
		}
	}

	if b.timeoutRateThreshold > 0 && totals.TimeoutRate() >= b.timeoutRateThreshold {
		return Evaluation{
			Tripped: true,
			Reason:  fmt.Sprintf("timeout rate %.2f%% exceeded threshold %.2f%%", totals.TimeoutRate()*100, b.timeoutRateThreshold*100),
		}
	}

	return Evaluation{}
}
