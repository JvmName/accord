function isResultWindowOpen(match) {
    const breakActive = match.break_started_at != null;
    const matchEnded  = match.ended_at != null;
    return breakActive || matchEnded;
}


module.exports = { isResultWindowOpen };
