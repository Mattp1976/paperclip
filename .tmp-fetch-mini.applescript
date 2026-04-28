tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "agentswarm.co.uk" then
        execute t javascript "window.__o2 = null; fetch('/api/orchestra/outcomes/3b28abbf-8d1f-408e-b80d-57a4361ff437', {credentials:'include'}).then(function(r){return r.json();}).then(function(d){ window.__o2 = {title:d.title, status:d.status, planSummary:d.plan && d.plan.summary, stepsTotal:d.steps.length, stepsCompleted:d.steps.filter(function(s){return s.status==='completed';}).length, estCost:d.plan && d.plan.estimatedCostCents, estDur:d.plan && d.plan.estimatedDurationMinutes, conf:d.plan && d.plan.confidenceScore, stepTitles:d.steps.map(function(s){return s.ordinal+1+'. '+s.title+' ['+s.stepType+']';}).slice(0,12).join(' | '), assumptionCount:d.plan && d.plan.assumptions ? d.plan.assumptions.length : 0, riskCount:d.plan && d.plan.risks ? d.plan.risks.length : 0}; })"
        return "kicked"
      end if
    end repeat
  end repeat
  return "no tab"
end tell
