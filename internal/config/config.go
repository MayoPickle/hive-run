package config

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	TargetURL           string
	Method              string
	Duration            time.Duration
	MaxConcurrency      int
	RampUp              time.Duration
	RequestTimeout      time.Duration
	MaxQPS              int
	Headers             map[string]string
	RequestBody         string
	StopOnErrorRate     float64
	StopOnTimeoutRate   float64
	MinSamplesBeforeStop int
	RetryCount          int
	RetryBackoff        time.Duration
	ReportDir           string
	ReportJSONPath      string
	ReportCSVPath       string
	ProxyURL            string
}

type stringSliceFlag struct {
	values []string
}

func (s *stringSliceFlag) String() string {
	return strings.Join(s.values, ",")
}

func (s *stringSliceFlag) Set(value string) error {
	s.values = append(s.values, value)
	return nil
}

func Load(args []string, now time.Time) (Config, error) {
	fs := flag.NewFlagSet("loadtest", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	var (
		envFile         = fs.String("env-file", ".env", "path to .env file")
		targetURL       = fs.String("target-url", "", "target URL")
		method          = fs.String("method", "", "HTTP method")
		duration        = fs.String("duration", "", "test duration, e.g. 30s")
		concurrency     = fs.String("concurrency", "", "max concurrency")
		rampUp          = fs.String("ramp-up", "", "ramp-up duration, e.g. 10s")
		timeout         = fs.String("timeout", "", "request timeout, e.g. 3s")
		maxQPS          = fs.String("qps", "", "global QPS cap")
		body            = fs.String("body", "", "request body")
		stopErrorRate   = fs.String("stop-on-error-rate", "", "stop when error rate reaches threshold")
		stopTimeoutRate = fs.String("stop-on-timeout-rate", "", "stop when timeout rate reaches threshold")
		minSamples      = fs.String("min-samples-before-stop", "", "minimum sample size before breaker can stop")
		retryCount      = fs.String("retry-count", "", "request retry count")
		retryBackoff    = fs.String("retry-backoff", "", "retry backoff, e.g. 200ms")
		reportDir       = fs.String("report-dir", "", "directory for generated reports")
		reportJSONPath  = fs.String("json-report", "", "path for JSON report")
		reportCSVPath   = fs.String("csv-report", "", "path for CSV report")
		proxyURL        = fs.String("proxy", "", "proxy URL, e.g. https://user:pass@host:port")
		headersFlag     stringSliceFlag
	)
	fs.Var(&headersFlag, "header", "request header in Key:Value form; repeatable")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	fileValues, err := loadEnvFile(*envFile)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		TargetURL:            chooseString(*targetURL, envValue("TARGET_URL"), fileValues["TARGET_URL"]),
		Method:               strings.ToUpper(defaultString(chooseString(*method, envValue("METHOD"), fileValues["METHOD"]), "GET")),
		RequestBody:          chooseString(*body, envValue("REQUEST_BODY"), fileValues["REQUEST_BODY"]),
		ReportDir:            defaultString(chooseString(*reportDir, envValue("REPORT_DIR"), fileValues["REPORT_DIR"]), "reports"),
		ReportJSONPath:       chooseString(*reportJSONPath, envValue("REPORT_JSON_PATH"), fileValues["REPORT_JSON_PATH"]),
		ReportCSVPath:        chooseString(*reportCSVPath, envValue("REPORT_CSV_PATH"), fileValues["REPORT_CSV_PATH"]),
		ProxyURL:             chooseString(*proxyURL, envValue("PROXY_URL"), fileValues["PROXY_URL"]),
		StopOnErrorRate:      0.50,
		StopOnTimeoutRate:    0.30,
		MinSamplesBeforeStop: 20,
		RetryCount:           0,
		RetryBackoff:         200 * time.Millisecond,
	}

	if cfg.TargetURL == "" {
		return Config{}, errors.New("TARGET_URL is required")
	}

	if _, err := url.ParseRequestURI(cfg.TargetURL); err != nil {
		return Config{}, fmt.Errorf("invalid TARGET_URL: %w", err)
	}

	parsedURL, err := url.Parse(cfg.TargetURL)
	if err != nil {
		return Config{}, fmt.Errorf("invalid TARGET_URL: %w", err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return Config{}, errors.New("TARGET_URL must use http or https")
	}
	if parsedURL.Hostname() == "" {
		return Config{}, errors.New("TARGET_URL must include a host")
	}

	if cfg.ProxyURL != "" {
		parsedProxy, err := url.Parse(cfg.ProxyURL)
		if err != nil {
			return Config{}, fmt.Errorf("invalid PROXY_URL: %w", err)
		}
		if parsedProxy.Scheme != "http" && parsedProxy.Scheme != "https" {
			return Config{}, errors.New("PROXY_URL must use http or https")
		}
		if parsedProxy.Hostname() == "" {
			return Config{}, errors.New("PROXY_URL must include a host")
		}
	}

	if cfg.Duration, err = parseDurationValue(*duration, chooseString(envValue("DURATION"), fileValues["DURATION"], ""), 30*time.Second); err != nil {
		return Config{}, fmt.Errorf("invalid duration: %w", err)
	}

	if cfg.Duration <= 0 {
		return Config{}, errors.New("DURATION must be greater than 0")
	}

	if cfg.MaxConcurrency, err = parseIntValue(*concurrency, chooseString(envValue("MAX_CONCURRENCY"), fileValues["MAX_CONCURRENCY"], ""), 10); err != nil {
		return Config{}, fmt.Errorf("invalid concurrency: %w", err)
	}

	if cfg.MaxConcurrency <= 0 {
		return Config{}, errors.New("MAX_CONCURRENCY must be greater than 0")
	}

	if cfg.RampUp, err = parseSpecialDuration(*rampUp, chooseString(envValue("RAMP_UP_SECONDS"), fileValues["RAMP_UP_SECONDS"], ""), 5*time.Second, time.Second); err != nil {
		return Config{}, fmt.Errorf("invalid ramp-up: %w", err)
	}

	if cfg.RequestTimeout, err = parseSpecialDuration(*timeout, chooseString(envValue("REQUEST_TIMEOUT_MS"), fileValues["REQUEST_TIMEOUT_MS"], ""), 5*time.Second, time.Millisecond); err != nil {
		return Config{}, fmt.Errorf("invalid request timeout: %w", err)
	}

	if cfg.RequestTimeout <= 0 {
		return Config{}, errors.New("REQUEST_TIMEOUT_MS must be greater than 0")
	}

	if cfg.MaxQPS, err = parseIntValue(*maxQPS, chooseString(envValue("MAX_QPS"), fileValues["MAX_QPS"], ""), 0); err != nil {
		return Config{}, fmt.Errorf("invalid MAX_QPS: %w", err)
	}

	if cfg.MaxQPS < 0 {
		return Config{}, errors.New("MAX_QPS cannot be negative")
	}

	if cfg.StopOnErrorRate, err = parseFloatValue(*stopErrorRate, chooseString(envValue("STOP_ON_ERROR_RATE"), fileValues["STOP_ON_ERROR_RATE"], ""), cfg.StopOnErrorRate); err != nil {
		return Config{}, fmt.Errorf("invalid STOP_ON_ERROR_RATE: %w", err)
	}

	if cfg.StopOnTimeoutRate, err = parseFloatValue(*stopTimeoutRate, chooseString(envValue("STOP_ON_TIMEOUT_RATE"), fileValues["STOP_ON_TIMEOUT_RATE"], ""), cfg.StopOnTimeoutRate); err != nil {
		return Config{}, fmt.Errorf("invalid STOP_ON_TIMEOUT_RATE: %w", err)
	}

	if cfg.StopOnErrorRate < 0 || cfg.StopOnErrorRate > 1 {
		return Config{}, errors.New("STOP_ON_ERROR_RATE must be between 0 and 1")
	}

	if cfg.StopOnTimeoutRate < 0 || cfg.StopOnTimeoutRate > 1 {
		return Config{}, errors.New("STOP_ON_TIMEOUT_RATE must be between 0 and 1")
	}

	if cfg.MinSamplesBeforeStop, err = parseIntValue(*minSamples, chooseString(envValue("MIN_SAMPLES_BEFORE_STOP"), fileValues["MIN_SAMPLES_BEFORE_STOP"], ""), cfg.MinSamplesBeforeStop); err != nil {
		return Config{}, fmt.Errorf("invalid MIN_SAMPLES_BEFORE_STOP: %w", err)
	}

	if cfg.MinSamplesBeforeStop <= 0 {
		return Config{}, errors.New("MIN_SAMPLES_BEFORE_STOP must be greater than 0")
	}

	if cfg.RetryCount, err = parseIntValue(*retryCount, chooseString(envValue("RETRY_COUNT"), fileValues["RETRY_COUNT"], ""), cfg.RetryCount); err != nil {
		return Config{}, fmt.Errorf("invalid RETRY_COUNT: %w", err)
	}

	if cfg.RetryCount < 0 {
		return Config{}, errors.New("RETRY_COUNT cannot be negative")
	}

	if cfg.RetryBackoff, err = parseSpecialDuration(*retryBackoff, chooseString(envValue("RETRY_BACKOFF_MS"), fileValues["RETRY_BACKOFF_MS"], ""), cfg.RetryBackoff, time.Millisecond); err != nil {
		return Config{}, fmt.Errorf("invalid RETRY_BACKOFF_MS: %w", err)
	}

	if cfg.RetryBackoff < 0 {
		return Config{}, errors.New("RETRY_BACKOFF_MS cannot be negative")
	}

	if !isAllowedMethod(cfg.Method) {
		return Config{}, fmt.Errorf("unsupported METHOD %q", cfg.Method)
	}

	cfg.Headers, err = parseHeaders(chooseString(envValue("REQUEST_HEADERS"), fileValues["REQUEST_HEADERS"], ""))
	if err != nil {
		return Config{}, err
	}

	flagHeaders, err := parseHeaders(strings.Join(headersFlag.values, ";"))
	if err != nil {
		return Config{}, err
	}

	for key, value := range flagHeaders {
		cfg.Headers[key] = value
	}

	if cfg.ReportJSONPath == "" || cfg.ReportCSVPath == "" {
		jsonPath, csvPath := defaultReportPaths(cfg.ReportDir, now)
		if cfg.ReportJSONPath == "" {
			cfg.ReportJSONPath = jsonPath
		}
		if cfg.ReportCSVPath == "" {
			cfg.ReportCSVPath = csvPath
		}
	}

	return cfg, nil
}

func (c Config) HTTPHeaders() http.Header {
	headers := make(http.Header, len(c.Headers))
	for key, value := range c.Headers {
		headers.Set(http.CanonicalHeaderKey(key), value)
	}
	return headers
}

func defaultReportPaths(reportDir string, now time.Time) (string, string) {
	baseName := fmt.Sprintf("loadtest-%s", now.Format("20060102-150405"))
	return filepath.Join(reportDir, baseName+".json"), filepath.Join(reportDir, baseName+".csv")
}

func loadEnvFile(path string) (map[string]string, error) {
	if path == "" {
		return map[string]string{}, nil
	}

	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, nil
		}
		return nil, fmt.Errorf("open env file: %w", err)
	}
	defer file.Close()

	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("invalid env line: %q", line)
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		values[key] = value
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read env file: %w", err)
	}

	return values, nil
}

func chooseString(flagValue, envValue, fileValue string) string {
	switch {
	case strings.TrimSpace(flagValue) != "":
		return strings.TrimSpace(flagValue)
	case strings.TrimSpace(envValue) != "":
		return strings.TrimSpace(envValue)
	default:
		return strings.TrimSpace(fileValue)
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func envValue(key string) string {
	value, ok := os.LookupEnv(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func parseDurationValue(flagValue, sourceValue string, fallback time.Duration) (time.Duration, error) {
	if strings.TrimSpace(flagValue) != "" {
		return time.ParseDuration(flagValue)
	}
	if strings.TrimSpace(sourceValue) != "" {
		return time.ParseDuration(sourceValue)
	}
	return fallback, nil
}

func parseSpecialDuration(flagValue, sourceValue string, fallback time.Duration, envUnit time.Duration) (time.Duration, error) {
	if strings.TrimSpace(flagValue) != "" {
		return time.ParseDuration(flagValue)
	}
	if strings.TrimSpace(sourceValue) != "" {
		parsed, err := strconv.Atoi(sourceValue)
		if err != nil {
			return 0, err
		}
		return time.Duration(parsed) * envUnit, nil
	}
	return fallback, nil
}

func parseIntValue(flagValue, sourceValue string, fallback int) (int, error) {
	if strings.TrimSpace(flagValue) != "" {
		return strconv.Atoi(flagValue)
	}
	if strings.TrimSpace(sourceValue) != "" {
		return strconv.Atoi(sourceValue)
	}
	return fallback, nil
}

func parseFloatValue(flagValue, sourceValue string, fallback float64) (float64, error) {
	if strings.TrimSpace(flagValue) != "" {
		return strconv.ParseFloat(flagValue, 64)
	}
	if strings.TrimSpace(sourceValue) != "" {
		return strconv.ParseFloat(sourceValue, 64)
	}
	return fallback, nil
}

func parseHeaders(raw string) (map[string]string, error) {
	headers := make(map[string]string)
	if strings.TrimSpace(raw) == "" {
		return headers, nil
	}

	for _, item := range strings.Split(raw, ";") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}

		key, value, ok := strings.Cut(item, ":")
		if !ok {
			return nil, fmt.Errorf("invalid header format %q", item)
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" {
			return nil, fmt.Errorf("header key cannot be empty in %q", item)
		}

		headers[key] = value
	}

	return headers, nil
}

func isAllowedMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}
