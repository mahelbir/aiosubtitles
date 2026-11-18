package ptt

import "testing"

func TestNetwork(t *testing.T) {
	for _, tc := range []struct {
		ttitle  string
		network string
		title   string
	}{
		{"Ref.Film.2020.720p.AMZN.WEBRip-GRP", "Amazon", "Ref Film Go"},
		{ttitle: "Ref.Keyed.2021.720p.NF.WEB-DL-GRP", network: "Netflix"},
	} {
		t.Run(tc.ttitle, func(t *testing.T) {
			result := Parse(tc.ttitle)
			assert.Equal(t, tc.network, result.Network)
			assert.Equal(t, tc.title, result.Title)
		})
	}

	for _, tc := range []struct {
		name     string
		ttitle   string
		episodes []int
		audio    []string
	}{
		{"unused episodes", "Ref.Audio.Only.2020.720p.AAC-GRP", []int{23}, []string(nil)},
		{"nil conversion", "Ref.Audio.Nil.2020.720p.AAC-GRP", []int(nil), []string{"AAC"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := Parse(tc.ttitle)
			assert.Equal(t, tc.audio, result.Audio)
		})
	}
}
