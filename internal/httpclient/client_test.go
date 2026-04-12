package httpclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientDoSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := New(
		Options{Timeout: time.Second, MaxConcurrency: 2},
		Request{Method: http.MethodGet, URL: server.URL},
	)

	result := client.Do(context.Background())
	if !result.Successful {
		t.Fatalf("expected successful result, got %+v", result)
	}
	if result.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status code: %d", result.StatusCode)
	}
}

func TestClientClassifiesTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := New(
		Options{Timeout: 30 * time.Millisecond, MaxConcurrency: 1},
		Request{Method: http.MethodGet, URL: server.URL},
	)

	result := client.Do(context.Background())
	if result.ErrorType != "timeout" {
		t.Fatalf("expected timeout, got %+v", result)
	}
}

func TestClientHandlesServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := New(
		Options{Timeout: time.Second, MaxConcurrency: 1},
		Request{Method: http.MethodGet, URL: server.URL},
	)

	result := client.Do(context.Background())
	if result.Successful {
		t.Fatalf("expected unsuccessful result, got %+v", result)
	}
	if result.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("unexpected status code: %d", result.StatusCode)
	}
}
