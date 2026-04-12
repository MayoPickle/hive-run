package httpclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"time"
)

type Options struct {
	Timeout        time.Duration
	MaxConcurrency int
	RetryCount     int
	RetryBackoff   time.Duration
	ProxyURL       string
	// RotatePerRequest, when true, injects a fresh random session ID into the
	// Bright Data proxy username on every request so each request exits from a
	// different IP address.
	RotatePerRequest bool
}

type Request struct {
	Method  string
	URL     string
	Headers http.Header
	Body    []byte
}

type Result struct {
	StatusCode int
	Duration   time.Duration
	ErrorType  string
	Successful bool
}

type Client struct {
	httpClient   *http.Client
	request      Request
	retryCount   int
	retryBackoff time.Duration
}

func New(opts Options, request Request) *Client {
	maxConcurrency := opts.MaxConcurrency
	if maxConcurrency <= 0 {
		maxConcurrency = 10
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	proxyFunc := http.ProxyFromEnvironment
	disableKeepAlives := false
	if opts.ProxyURL != "" {
		if opts.RotatePerRequest {
			// Generate a new random Bright Data session ID for every new
			// connection. Combined with DisableKeepAlives this gives a fresh
			// exit IP on every single HTTP request.
			baseProxyURL := opts.ProxyURL
			proxyFunc = func(_ *http.Request) (*url.URL, error) {
				rotated := injectSession(baseProxyURL, fmt.Sprintf("%d", rand.Int63()))
				return url.Parse(rotated)
			}
			disableKeepAlives = true
		} else {
			parsedProxy, err := url.Parse(opts.ProxyURL)
			if err == nil {
				proxyFunc = http.ProxyURL(parsedProxy)
			}
		}
	}

	transport := &http.Transport{
		Proxy:                 proxyFunc,
		DisableKeepAlives:     disableKeepAlives,
		MaxIdleConns:          max(100, maxConcurrency*2),
		MaxIdleConnsPerHost:   max(10, maxConcurrency),
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &Client{
		httpClient: &http.Client{
			Timeout:   timeout,
			Transport: transport,
		},
		request:      request,
		retryCount:   opts.RetryCount,
		retryBackoff: opts.RetryBackoff,
	}
}

func (c *Client) Do(ctx context.Context) Result {
	var last Result

	for attempt := 0; attempt <= c.retryCount; attempt++ {
		req, err := c.buildRequest(ctx)
		if err != nil {
			return Result{ErrorType: "request_build"}
		}

		startedAt := time.Now()
		resp, err := c.httpClient.Do(req)
		duration := time.Since(startedAt)

		if err != nil {
			last = Result{
				Duration:  duration,
				ErrorType: classifyError(err, ctx),
			}

			if attempt < c.retryCount && shouldRetry(last.StatusCode, last.ErrorType) && ctx.Err() == nil && waitBackoff(ctx, c.retryBackoff, attempt) {
				continue
			}

			return last
		}

		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()

		last = Result{
			StatusCode: resp.StatusCode,
			Duration:   duration,
			Successful: resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusBadRequest,
		}

		if attempt < c.retryCount && !last.Successful && shouldRetry(last.StatusCode, "") && ctx.Err() == nil && waitBackoff(ctx, c.retryBackoff, attempt) {
			continue
		}

		return last
	}

	return last
}

func (c *Client) buildRequest(ctx context.Context) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, c.request.Method, c.request.URL, bytes.NewReader(c.request.Body))
	if err != nil {
		return nil, err
	}

	if c.request.Headers != nil {
		req.Header = c.request.Headers.Clone()
	}
	return req, nil
}

func classifyError(err error, ctx context.Context) string {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(ctx.Err(), context.Canceled):
		return "canceled"
	case errors.Is(err, context.DeadlineExceeded), errors.Is(ctx.Err(), context.DeadlineExceeded):
		return "timeout"
	default:
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return "timeout"
		}
		return "network"
	}
}

func shouldRetry(statusCode int, errorType string) bool {
	if errorType == "timeout" || errorType == "network" {
		return true
	}
	return statusCode == http.StatusTooManyRequests || statusCode >= http.StatusInternalServerError
}

func waitBackoff(ctx context.Context, base time.Duration, attempt int) bool {
	if base <= 0 {
		base = 100 * time.Millisecond
	}

	delay := time.Duration(attempt+1) * base
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// injectSession appends "-session-{id}" to the username portion of a proxy URL.
// This is the Bright Data convention for pinning an exit-IP to a session.
func injectSession(rawURL, sessionID string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.User == nil {
		return rawURL
	}
	username := u.User.Username()
	password, _ := u.User.Password()
	u.User = url.UserPassword(username+"-session-"+sessionID, password)
	return u.String()
}

// NewPool creates count independent clients each pinned to a unique proxy
// session (when ProxyURL is set). Use one client per goroutine/worker so that
// concurrent load-test workers fan out across different exit IPs.
// Deprecated: prefer a single client with RotatePerRequest=true for per-request rotation.
func NewPool(opts Options, request Request, count int) []*Client {
	pool := make([]*Client, count)
	for i := range pool {
		o := opts
		if o.ProxyURL != "" {
			o.RotatePerRequest = true
		}
		pool[i] = New(o, request)
	}
	return pool
}
