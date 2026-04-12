package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadFromEnvFile(t *testing.T) {
	t.Setenv("TARGET_URL", "")

	tempDir := t.TempDir()
	envPath := filepath.Join(tempDir, ".env")
	envContent := `
TARGET_URL=https://example.com/health
METHOD=post
DURATION=45s
MAX_CONCURRENCY=25
RAMP_UP_SECONDS=12
REQUEST_TIMEOUT_MS=1500
MAX_QPS=120
REQUEST_HEADERS=Authorization:Bearer test;X-Test:yes
REQUEST_BODY={"ping":"pong"}
STOP_ON_ERROR_RATE=0.4
STOP_ON_TIMEOUT_RATE=0.2
MIN_SAMPLES_BEFORE_STOP=15
RETRY_COUNT=1
RETRY_BACKOFF_MS=250
REPORT_DIR=artifacts
`
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	now := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	cfg, err := Load([]string{"--env-file", envPath}, now)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.TargetURL != "https://example.com/health" {
		t.Fatalf("unexpected target URL: %s", cfg.TargetURL)
	}
	if cfg.Method != "POST" {
		t.Fatalf("unexpected method: %s", cfg.Method)
	}
	if cfg.Duration != 45*time.Second {
		t.Fatalf("unexpected duration: %s", cfg.Duration)
	}
	if cfg.MaxConcurrency != 25 {
		t.Fatalf("unexpected concurrency: %d", cfg.MaxConcurrency)
	}
	if cfg.RampUp != 12*time.Second {
		t.Fatalf("unexpected ramp-up: %s", cfg.RampUp)
	}
	if cfg.RequestTimeout != 1500*time.Millisecond {
		t.Fatalf("unexpected timeout: %s", cfg.RequestTimeout)
	}
	if cfg.MaxQPS != 120 {
		t.Fatalf("unexpected qps: %d", cfg.MaxQPS)
	}
	if got := cfg.HTTPHeaders().Get("Authorization"); got != "Bearer test" {
		t.Fatalf("unexpected Authorization header: %s", got)
	}
	if cfg.ReportJSONPath != filepath.Join("artifacts", "loadtest-20260410-120000.json") {
		t.Fatalf("unexpected json report path: %s", cfg.ReportJSONPath)
	}
	if cfg.ReportCSVPath != filepath.Join("artifacts", "loadtest-20260410-120000.csv") {
		t.Fatalf("unexpected csv report path: %s", cfg.ReportCSVPath)
	}
}

func TestLoadFlagsOverrideEnv(t *testing.T) {
	t.Setenv("TARGET_URL", "")

	tempDir := t.TempDir()
	envPath := filepath.Join(tempDir, ".env")
	envContent := `
TARGET_URL=https://example.com
MAX_CONCURRENCY=10
REQUEST_HEADERS=X-Test:env
`
	if err := os.WriteFile(envPath, []byte(envContent), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	cfg, err := Load([]string{
		"--env-file", envPath,
		"--concurrency", "50",
		"--method", "POST",
		"--header", "X-Test:flag",
		"--header", "X-Extra:value",
	}, time.Now())
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.MaxConcurrency != 50 {
		t.Fatalf("expected concurrency 50, got %d", cfg.MaxConcurrency)
	}
	if cfg.Method != "POST" {
		t.Fatalf("expected POST, got %s", cfg.Method)
	}
	if got := cfg.HTTPHeaders().Get("X-Test"); got != "flag" {
		t.Fatalf("expected flag header override, got %s", got)
	}
	if got := cfg.HTTPHeaders().Get("X-Extra"); got != "value" {
		t.Fatalf("expected extra header, got %s", got)
	}
}

func TestLoadRequiresTargetURL(t *testing.T) {
	t.Setenv("TARGET_URL", "")

	_, err := Load(nil, time.Now())
	if err == nil {
		t.Fatal("expected error for missing TARGET_URL")
	}
}
