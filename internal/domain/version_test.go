package domain_test

import (
	"testing"

	"writtt/internal/domain"
)

func TestCompareSemVer(t *testing.T) {
	cases := []struct {
		a    string
		b    string
		want int
	}{
		{"v0.2.0", "v0.1.3", 1},
		{"0.2.0", "0.1.3", 1},
		{"v0.1.3", "v0.2.0", -1},
		{"v0.2.0", "0.2.0", 0},
		{"v0.2.0", "v0.2.0-beta.1", 1},
		{"v0.2.0-beta.1", "v0.2.0", -1},
		{"v1.0.0", "v0.9.99", 1},
		{"dev", "v0.2.0", 0},
		{"", "v0.2.0", 0},
	}
	for _, tc := range cases {
		got := domain.CompareSemVer(tc.a, tc.b)
		if got != tc.want {
			t.Fatalf("CompareSemVer(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}
