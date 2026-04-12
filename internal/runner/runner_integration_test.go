package runner

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"hive-run/internal/httpclient"
	"hive-run/internal/metrics"
	"hive-run/internal/report"
	"hive-run/internal/safety"
)

func TestRunnerWithReportsAgainstMockServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := httpclient.New(
		httpclient.Options{
			Timeout:        time.Second,
			MaxConcurrency: 3,
		},
		httpclient.Request{
			Method: http.MethodGet,
			URL:    server.URL,
		},
	)

	collector := metrics.NewCollector(time.Now())
	limiter := safety.NewRateLimiter(30)
	defer limiter.Close()

	loadRunner := New(
		Options{
			Duration:       150 * time.Millisecond,
			MaxConcurrency: 3,
			RampUp:         50 * time.Millisecond,
		},
		client,
		collector,
		safety.NewBreaker(0.9, 0.9, 100),
		limiter,
	)

	result, err := loadRunner.Run(context.Background())
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Snapshot.TotalRequests == 0 {
		t.Fatal("expected some requests to complete")
	}

	reportDir := t.TempDir()
	paths, err := report.EnsurePaths(reportDir, "", "", time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("EnsurePaths returned error: %v", err)
	}

	if err := report.WriteJSON(paths.JSON, result.Snapshot); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}
	if err := report.WriteCSV(paths.CSV, result.Snapshot); err != nil {
		t.Fatalf("WriteCSV returned error: %v", err)
	}

	jsonBytes, err := os.ReadFile(paths.JSON)
	if err != nil {
		t.Fatalf("read JSON report: %v", err)
	}

	var snapshot metrics.Snapshot
	if err := json.Unmarshal(jsonBytes, &snapshot); err != nil {
		t.Fatalf("decode JSON report: %v", err)
	}
	if snapshot.TotalRequests == 0 {
		t.Fatal("expected total requests in JSON report")
	}

	if _, err := os.Stat(paths.CSV); err != nil {
		t.Fatalf("expected CSV report to exist: %v", err)
	}
}
