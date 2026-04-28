tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "agentswarm.co.uk/" or u contains "orqestra.run/" then
        execute t javascript "window.__list = null; fetch('/api/companies/d5979ff4-1e3f-49d9-972c-d63dd427aeb2/orchestra/outcomes', {credentials:'include'}).then(r => r.json()).then(d => { window.__list = d; })"
        return "kicked: " & u
      end if
    end repeat
  end repeat
  return "no tab"
end tell
