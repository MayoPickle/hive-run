package report

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"hive-run/internal/metrics"
)

type Paths struct {
	JSON string
	CSV  string
}

func EnsurePaths(reportDir, jsonPath, csvPath string, now time.Time) (Paths, error) {
	if strings.TrimSpace(reportDir) == "" {
		reportDir = "reports"
	}

	baseName := fmt.Sprintf("loadtest-%s", now.Format("20060102-150405"))
	if strings.TrimSpace(jsonPath) == "" {
		jsonPath = filepath.Join(reportDir, baseName+".json")
	}
	if strings.TrimSpace(csvPath) == "" {
		csvPath = filepath.Join(reportDir, baseName+".csv")
	}

	for _, outputPath := range []string{jsonPath, csvPath} {
		dir := filepath.Dir(outputPath)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Paths{}, fmt.Errorf("create report directory %s: %w", dir, err)
		}
	}

	return Paths{JSON: jsonPath, CSV: csvPath}, nil
}

func WriteJSON(path string, snapshot metrics.Snapshot) error {
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create JSON report: %w", err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(snapshot); err != nil {
		return fmt.Errorf("encode JSON report: %w", err)
	}

	return nil
}

func WriteCSV(path string, snapshot metrics.Snapshot) error {
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create CSV report: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	rows := [][]string{
		{"section", "name", "value"},
		{"summary", "started_at", snapshot.StartedAt.Format(time.RFC3339Nano)},
		{"summary", "finished_at", snapshot.FinishedAt.Format(time.RFC3339Nano)},
		{"summary", "duration_seconds", formatFloat(snapshot.DurationSeconds)},
		{"summary", "total_requests", fmt.Sprintf("%d", snapshot.TotalRequests)},
		{"summary", "successful_requests", fmt.Sprintf("%d", snapshot.SuccessfulRequests)},
		{"summary", "failed_requests", fmt.Sprintf("%d", snapshot.FailedRequests)},
		{"summary", "timeout_count", fmt.Sprintf("%d", snapshot.TimeoutCount)},
		{"summary", "success_rate", formatFloat(snapshot.SuccessRate)},
		{"summary", "throughput_rps", formatFloat(snapshot.ThroughputRPS)},
		{"latency_ms", "average", formatFloat(snapshot.LatencyMs.Average)},
		{"latency_ms", "min", formatFloat(snapshot.LatencyMs.Min)},
		{"latency_ms", "p50", formatFloat(snapshot.LatencyMs.P50)},
		{"latency_ms", "p95", formatFloat(snapshot.LatencyMs.P95)},
		{"latency_ms", "p99", formatFloat(snapshot.LatencyMs.P99)},
		{"latency_ms", "max", formatFloat(snapshot.LatencyMs.Max)},
	}

	for _, key := range sortedKeys(snapshot.StatusCodes) {
		rows = append(rows, []string{"status_code", key, fmt.Sprintf("%d", snapshot.StatusCodes[key])})
	}

	for _, key := range sortedKeys(snapshot.ErrorTypes) {
		rows = append(rows, []string{"error_type", key, fmt.Sprintf("%d", snapshot.ErrorTypes[key])})
	}

	if err := writer.WriteAll(rows); err != nil {
		return fmt.Errorf("write CSV report: %w", err)
	}

	return nil
}

func RenderConsole(snapshot metrics.Snapshot, stoppedEarly bool, stopReason string, paths Paths) string {
	var builder strings.Builder

	builder.WriteString("Load test summary\n")
	builder.WriteString(fmt.Sprintf("Runtime: %.3fs\n", snapshot.DurationSeconds))
	builder.WriteString(fmt.Sprintf("Requests: total=%d success=%d failed=%d timeout=%d\n", snapshot.TotalRequests, snapshot.SuccessfulRequests, snapshot.FailedRequests, snapshot.TimeoutCount))
	builder.WriteString(fmt.Sprintf("Rates: success=%.2f%% throughput=%.3f req/s\n", snapshot.SuccessRate*100, snapshot.ThroughputRPS))
	builder.WriteString(fmt.Sprintf("Latency (ms): avg=%.3f min=%.3f p50=%.3f p95=%.3f p99=%.3f max=%.3f\n", snapshot.LatencyMs.Average, snapshot.LatencyMs.Min, snapshot.LatencyMs.P50, snapshot.LatencyMs.P95, snapshot.LatencyMs.P99, snapshot.LatencyMs.Max))

	if len(snapshot.StatusCodes) > 0 {
		builder.WriteString("Status codes: ")
		builder.WriteString(renderKV(snapshot.StatusCodes))
		builder.WriteByte('\n')
	}

	if len(snapshot.ErrorTypes) > 0 {
		builder.WriteString("Error types: ")
		builder.WriteString(renderKV(snapshot.ErrorTypes))
		builder.WriteByte('\n')
	}

	if stoppedEarly {
		builder.WriteString(fmt.Sprintf("Safety stop: triggered (%s)\n", stopReason))
	} else {
		builder.WriteString("Safety stop: not triggered\n")
	}

	builder.WriteString(fmt.Sprintf("Reports: json=%s csv=%s", paths.JSON, paths.CSV))
	return builder.String()
}

func renderKV(values map[string]int) string {
	parts := make([]string, 0, len(values))
	for _, key := range sortedKeys(values) {
		parts = append(parts, fmt.Sprintf("%s=%d", key, values[key]))
	}
	return strings.Join(parts, ", ")
}

func sortedKeys(values map[string]int) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func formatFloat(value float64) string {
	return fmt.Sprintf("%.3f", value)
}
