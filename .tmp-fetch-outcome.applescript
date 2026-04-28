tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "agentswarm.co.uk" or u contains "orqestra.run" then
        execute t javascript "window.__o = null; Promise.all([fetch('/api/orchestra/outcomes/3b28abbf-8d1f-408e-b80d-57a4361ff437', {credentials:'include'}).then(r => r.json()), fetch('/api/orchestra/outcomes/3b28abbf-8d1f-408e-b80d-57a4361ff437/events', {credentials:'include'}).then(r => r.json()), fetch('/api/orchestra/outcomes/3b28abbf-8d1f-408e-b80d-57a4361ff437/narrative', {credentials:'include'}).then(r => r.json())]).then(([d,e,n]) => { window.__o = {detail:d, events:e, narr:n}; })"
        return "kicked"
      end if
    end repeat
  end repeat
  return "no tab"
end tell
