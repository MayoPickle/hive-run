package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"hive-run/internal/config"
	"hive-run/internal/httpclient"
	"hive-run/internal/metrics"
	"hive-run/internal/report"
	"hive-run/internal/runner"
	"hive-run/internal/safety"
)

func main() {
	cfg, err := config.Load(os.Args[1:], time.Now())
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(1)
	}

	clientOpts := httpclient.Options{
		Timeout:          cfg.RequestTimeout,
		MaxConcurrency:   cfg.MaxConcurrency,
		RetryCount:       cfg.RetryCount,
		RetryBackoff:     cfg.RetryBackoff,
		ProxyURL:         cfg.ProxyURL,
		RotatePerRequest: cfg.ProxyURL != "",
	}
	clientReq := httpclient.Request{
		Method:  cfg.Method,
		URL:     cfg.TargetURL,
		Headers: cfg.HTTPHeaders(),
		Body:    []byte(cfg.RequestBody),
	}

	collector := metrics.NewCollector(time.Now())
	breaker := safety.NewBreaker(cfg.StopOnErrorRate, cfg.StopOnTimeoutRate, cfg.MinSamplesBeforeStop)
	limiter := safety.NewRateLimiter(cfg.MaxQPS)
	defer limiter.Close()

	requester := httpclient.New(clientOpts, clientReq)
	loadRunner := runner.New(
		runner.Options{Duration: cfg.Duration, MaxConcurrency: cfg.MaxConcurrency, RampUp: cfg.RampUp},
		requester, collector, breaker, limiter,
	)

	result, err := loadRunner.Run(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "load test failed: %v\n", err)
		os.Exit(1)
	}

	result.Snapshot.TargetURL = cfg.TargetURL

	paths, err := report.EnsurePaths(cfg.ReportDir, cfg.ReportJSONPath, cfg.ReportCSVPath, time.Now())
	if err != nil {
		fmt.Fprintf(os.Stderr, "report path error: %v\n", err)
		os.Exit(1)
	}

	if err := report.WriteJSON(paths.JSON, result.Snapshot); err != nil {
		fmt.Fprintf(os.Stderr, "json report error: %v\n", err)
		os.Exit(1)
	}

	if err := report.WriteCSV(paths.CSV, result.Snapshot); err != nil {
		fmt.Fprintf(os.Stderr, "csv report error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(report.RenderConsole(result.Snapshot, result.StoppedEarly, result.StopReason, paths))
}
