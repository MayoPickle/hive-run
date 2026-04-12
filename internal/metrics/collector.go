package metrics

import (
	"math"
	"sort"
	"strconv"
	"sync"
	"time"
)

type Outcome struct {
	Duration   time.Duration
	StatusCode int
	ErrorType  string
	Successful bool
}

type Totals struct {
	StartedAt          time.Time
	LastRecordedAt     time.Time
	TotalRequests      int
	SuccessfulRequests int
	FailedRequests     int
	TimeoutCount       int
}

func (t Totals) ErrorRate() float64 {
	if t.TotalRequests == 0 {
		return 0
	}
	return float64(t.FailedRequests) / float64(t.TotalRequests)
}

func (t Totals) TimeoutRate() float64 {
	if t.TotalRequests == 0 {
		return 0
	}
	return float64(t.TimeoutCount) / float64(t.TotalRequests)
}

type LatencySummary struct {
	Average float64 `json:"average"`
	Min     float64 `json:"min"`
	P50     float64 `json:"p50"`
	P95     float64 `json:"p95"`
	P99     float64 `json:"p99"`
	Max     float64 `json:"max"`
}

type Snapshot struct {
	TargetURL          string            `json:"target_url"`
	StartedAt          time.Time         `json:"started_at"`
	FinishedAt         time.Time         `json:"finished_at"`
	DurationSeconds    float64           `json:"duration_seconds"`
	TotalRequests      int               `json:"total_requests"`
	SuccessfulRequests int               `json:"successful_requests"`
	FailedRequests     int               `json:"failed_requests"`
	TimeoutCount       int               `json:"timeout_count"`
	SuccessRate        float64           `json:"success_rate"`
	ThroughputRPS      float64           `json:"throughput_rps"`
	LatencyMs          LatencySummary    `json:"latency_ms"`
	StatusCodes        map[string]int    `json:"status_codes"`
	ErrorTypes         map[string]int    `json:"error_types"`
}

type Collector struct {
	mu             sync.Mutex
	startedAt      time.Time
	lastRecordedAt time.Time
	totalLatency   time.Duration
	durations      []time.Duration
	statusCodes    map[int]int
	errorTypes     map[string]int
	total          int
	successful     int
	failed         int
	timeout        int
	minLatency     time.Duration
	maxLatency     time.Duration
}

func NewCollector(startedAt time.Time) *Collector {
	return &Collector{
		startedAt:   startedAt,
		statusCodes: make(map[int]int),
		errorTypes:  make(map[string]int),
	}
}

func (c *Collector) Record(outcome Outcome) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.total++
	c.lastRecordedAt = time.Now()
	c.totalLatency += outcome.Duration
	c.durations = append(c.durations, outcome.Duration)

	if c.total == 1 || outcome.Duration < c.minLatency {
		c.minLatency = outcome.Duration
	}
	if outcome.Duration > c.maxLatency {
		c.maxLatency = outcome.Duration
	}

	if outcome.StatusCode > 0 {
		c.statusCodes[outcome.StatusCode]++
	}
	if outcome.ErrorType != "" {
		c.errorTypes[outcome.ErrorType]++
		if outcome.ErrorType == "timeout" {
			c.timeout++
		}
	}

	if outcome.Successful {
		c.successful++
	} else {
		c.failed++
	}
}

func (c *Collector) Totals() Totals {
	c.mu.Lock()
	defer c.mu.Unlock()

	return Totals{
		StartedAt:          c.startedAt,
		LastRecordedAt:     c.lastRecordedAt,
		TotalRequests:      c.total,
		SuccessfulRequests: c.successful,
		FailedRequests:     c.failed,
		TimeoutCount:       c.timeout,
	}
}

func (c *Collector) Snapshot(finishedAt time.Time) Snapshot {
	c.mu.Lock()
	defer c.mu.Unlock()

	durationSeconds := finishedAt.Sub(c.startedAt).Seconds()
	if durationSeconds < 0 {
		durationSeconds = 0
	}

	durations := append([]time.Duration(nil), c.durations...)
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })

	statusCodes := make(map[string]int, len(c.statusCodes))
	for code, count := range c.statusCodes {
		statusCodes[strconv.Itoa(code)] = count
	}

	errorTypes := make(map[string]int, len(c.errorTypes))
	for name, count := range c.errorTypes {
		errorTypes[name] = count
	}

	successRate := 0.0
	throughput := 0.0
	latency := LatencySummary{}

	if c.total > 0 {
		successRate = float64(c.successful) / float64(c.total)
		if durationSeconds > 0 {
			throughput = float64(c.total) / durationSeconds
		}
		latency = LatencySummary{
			Average: durationToMS(c.totalLatency / time.Duration(c.total)),
			Min:     durationToMS(c.minLatency),
			P50:     durationToMS(percentile(durations, 50)),
			P95:     durationToMS(percentile(durations, 95)),
			P99:     durationToMS(percentile(durations, 99)),
			Max:     durationToMS(c.maxLatency),
		}
	}

	return Snapshot{
		StartedAt:          c.startedAt,
		FinishedAt:         finishedAt,
		DurationSeconds:    roundFloat(durationSeconds),
		TotalRequests:      c.total,
		SuccessfulRequests: c.successful,
		FailedRequests:     c.failed,
		TimeoutCount:       c.timeout,
		SuccessRate:        roundFloat(successRate),
		ThroughputRPS:      roundFloat(throughput),
		LatencyMs:          latency,
		StatusCodes:        statusCodes,
		ErrorTypes:         errorTypes,
	}
}

func percentile(values []time.Duration, p float64) time.Duration {
	if len(values) == 0 {
		return 0
	}

	rank := int(math.Ceil((p / 100) * float64(len(values))))
	if rank <= 0 {
		rank = 1
	}
	if rank > len(values) {
		rank = len(values)
	}

	return values[rank-1]
}

func durationToMS(duration time.Duration) float64 {
	return roundFloat(float64(duration) / float64(time.Millisecond))
}

func roundFloat(value float64) float64 {
	return math.Round(value*1000) / 1000
}
