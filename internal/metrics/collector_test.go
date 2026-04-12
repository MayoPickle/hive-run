package metrics

import (
	"testing"
	"time"
)

func TestCollectorSnapshot(t *testing.T) {
	start := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	collector := NewCollector(start)

	collector.Record(Outcome{Duration: 10 * time.Millisecond, StatusCode: 200, Successful: true})
	collector.Record(Outcome{Duration: 20 * time.Millisecond, StatusCode: 500, Successful: false})
	collector.Record(Outcome{Duration: 30 * time.Millisecond, ErrorType: "timeout", Successful: false})
	collector.Record(Outcome{Duration: 40 * time.Millisecond, ErrorType: "network", Successful: false})

	snapshot := collector.Snapshot(start.Add(time.Second))
	if snapshot.TotalRequests != 4 {
		t.Fatalf("expected 4 total requests, got %d", snapshot.TotalRequests)
	}
	if snapshot.SuccessfulRequests != 1 {
		t.Fatalf("expected 1 successful request, got %d", snapshot.SuccessfulRequests)
	}
	if snapshot.FailedRequests != 3 {
		t.Fatalf("expected 3 failed requests, got %d", snapshot.FailedRequests)
	}
	if snapshot.TimeoutCount != 1 {
		t.Fatalf("expected 1 timeout, got %d", snapshot.TimeoutCount)
	}
	if snapshot.LatencyMs.P50 != 20 {
		t.Fatalf("expected p50 20ms, got %v", snapshot.LatencyMs.P50)
	}
	if snapshot.LatencyMs.P95 != 40 {
		t.Fatalf("expected p95 40ms, got %v", snapshot.LatencyMs.P95)
	}
	if snapshot.StatusCodes["200"] != 1 || snapshot.StatusCodes["500"] != 1 {
		t.Fatalf("unexpected status code counts: %+v", snapshot.StatusCodes)
	}
	if snapshot.ErrorTypes["timeout"] != 1 || snapshot.ErrorTypes["network"] != 1 {
		t.Fatalf("unexpected error type counts: %+v", snapshot.ErrorTypes)
	}
}
