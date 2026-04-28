tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "agentswarm.co.uk" or u contains "orqestra.run" then
        return execute t javascript "JSON.stringify(window.__o)"
      end if
    end repeat
  end repeat
  return "no tab"
end tell
