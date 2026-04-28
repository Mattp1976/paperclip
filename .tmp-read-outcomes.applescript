tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "agentswarm.co.uk/" or u contains "orqestra.run/" then
        return execute t javascript "JSON.stringify((window.__list||[]).slice(0,8).map(o => ({id:o.id,title:o.title,status:o.status,createdAt:o.createdAt,steps:o.stepsTotal,done:o.stepsCompleted})))"
      end if
    end repeat
  end repeat
  return "no tab"
end tell
