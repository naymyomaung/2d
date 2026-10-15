import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  History,
  LayoutDashboard,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import Swal from 'sweetalert2'

const API = 'https://api.thaistock2d.com'
const POLL_INTERVAL = 10_000
const HISTORY_PAGE_SIZE = 10

const sessions = [
  { time: '11:00', label: 'Morning', period: 'AM' },
  { time: '12:01', label: 'Midday', period: 'PM' },
  { time: '15:00', label: 'Afternoon', period: 'PM' },
  { time: '16:30', label: 'Closing', period: 'PM' },
]

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

function numeric(value) {
  if (value == null || value === '--') return null
  const parsed = Number(String(value).replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

function displayNumber(value, decimals = 2) {
  const parsed = numeric(value)
  return parsed == null
    ? value || '--'
    : parsed.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
}

function dateLabel(date) {
  if (!date) return 'Today'
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function App() {
  const [live, setLive] = useState(null)
  const [results, setResults] = useState([])
  const [archive, setArchive] = useState([])
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [archiveError, setArchiveError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState('today')
  const [historyDateFilter, setHistoryDateFilter] = useState('all')
  const [historySessionFilter, setHistorySessionFilter] = useState('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyDateLoading, setHistoryDateLoading] = useState(false)
  const [historyDateError, setHistoryDateError] = useState('')
  const [calendarSelectedDate, setCalendarSelectedDate] = useState('')
  const [calendarResults, setCalendarResults] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [clock, setClock] = useState(new Date())
  const [voiceAlerts, setVoiceAlerts] = useState(false)
  const previousLiveRef = useRef(null)
  const marketDate = live?.date

  const loadLive = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const response = await fetch(`${API}/live`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Live API returned ${response.status}`)
      const data = await response.json()
      if (!data?.live || !Array.isArray(data.result)) throw new Error('The live API returned an unexpected response')

      setLive(data.live)
      setResults(data.result)
      setLastUpdated(new Date())
      setConnection('online')
      setLoadError('')
      if (manual) {
        toast.fire({ icon: 'success', title: 'Market data is up to date' })
      }
    } catch (error) {
      setConnection('offline')
      setLoadError(error instanceof Error ? error.message : 'Unable to load live market data')
      if (manual) {
        await toast.fire({ icon: 'error', title: 'Could not refresh market data' })
      }
    } finally {
      if (manual) setRefreshing(false)
    }
  }, [])

  const loadArchive = useCallback(async () => {
    try {
      const response = await fetch(`${API}/2d_result`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Results API returned ${response.status}`)
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('The results API returned an unexpected response')
      setArchive(data)
      setArchiveError('')
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Unable to load previous results')
    } finally {
      setArchiveLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLive()
    const interval = window.setInterval(() => loadLive(), POLL_INTERVAL)
    const clockInterval = window.setInterval(() => setClock(new Date()), 1000)
    return () => {
      window.clearInterval(interval)
      window.clearInterval(clockInterval)
    }
  }, [loadLive])

  useEffect(() => {
    loadArchive()
    const interval = window.setInterval(loadArchive, 60_000)
    return () => window.clearInterval(interval)
  }, [loadArchive])

  useEffect(() => {
    const currentValue = live?.twod
    if (!currentValue || currentValue === '--') return

    const previous = previousLiveRef.current
    previousLiveRef.current = { date: live.date, value: currentValue }
    if (!voiceAlerts || !previous || previous.date !== live.date || previous.value === currentValue) return

    if (!('speechSynthesis' in window)) {
      setVoiceAlerts(false)
      toast.fire({ icon: 'error', title: 'Voice alerts are not supported in this browser' })
      return
    }

    window.speechSynthesis.cancel()
    const announcement = new SpeechSynthesisUtterance(currentValue.split('').join(' '))
    announcement.lang = 'en-US'
    announcement.rate = 0.95
    window.speechSynthesis.speak(announcement)
  }, [live?.date, live?.twod, voiceAlerts])

  useEffect(() => {
    if (!live?.date) return
    setCalendarSelectedDate((selected) => selected || live.date)
  }, [live?.date])

  useEffect(() => {
    if (!calendarSelectedDate || archiveLoading) return undefined
    const cached = archive.find((day) => day.date === calendarSelectedDate)
    if (cached) {
      setCalendarResults(Array.isArray(cached.child) ? cached.child : [])
      setCalendarError('')
      setCalendarLoading(false)
      return undefined
    }
    if (marketDate && calendarSelectedDate > marketDate) {
      setCalendarResults([])
      setCalendarError('')
      setCalendarLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setCalendarLoading(true)
    setCalendarError('')
    fetch(`${API}/2d_result?date=${calendarSelectedDate}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Results API returned ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The results API returned an unexpected response')
        const day = data.find((entry) => entry.date === calendarSelectedDate)
        setCalendarResults(Array.isArray(day?.child) ? day.child : [])
        if (day) {
          setArchive((current) => [...current.filter((entry) => entry.date !== day.date), day]
            .sort((left, right) => right.date.localeCompare(left.date)))
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setCalendarError(error instanceof Error ? error.message : 'Unable to load results for this date')
          setCalendarResults([])
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarLoading(false)
      })
    return () => controller.abort()
  }, [archive, archiveLoading, calendarSelectedDate, marketDate])

  useEffect(() => {
    if (!historyDateFilter || historyDateFilter === 'all' || archiveLoading) return undefined
    if (archive.some((day) => day.date === historyDateFilter)) {
      setHistoryDateError('')
      setHistoryDateLoading(false)
      return undefined
    }
    if (marketDate && historyDateFilter > marketDate) {
      setHistoryDateError('')
      setHistoryDateLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setHistoryDateLoading(true)
    setHistoryDateError('')
    fetch(`${API}/2d_result?date=${historyDateFilter}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Results API returned ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The results API returned an unexpected response')
        const day = data.find((entry) => entry.date === historyDateFilter)
        if (day) {
          setArchive((current) => [...current.filter((entry) => entry.date !== day.date), day]
            .sort((left, right) => right.date.localeCompare(left.date)))
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setHistoryDateError(error instanceof Error ? error.message : 'Unable to load results for this date')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryDateLoading(false)
      })
    return () => controller.abort()
  }, [archive, archiveLoading, historyDateFilter, marketDate])

  const historyRows = useMemo(() => archive.flatMap((day) => (day.child || [])
    .filter((entry) => historySessionFilter === 'all' || entry.time?.startsWith(historySessionFilter))
    .map((entry) => ({ ...entry, date: day.date })))
    .filter((entry) => historyDateFilter === 'all' || entry.date === historyDateFilter), [archive, historyDateFilter, historySessionFilter])
  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyPageCount)
  const pageHistoryRows = historyRows.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE)
  const calendarYear = calendarMonth.getFullYear()
  const calendarMonthIndex = calendarMonth.getMonth()
  const calendarDays = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate()
  const calendarOffset = new Date(calendarYear, calendarMonthIndex, 1).getDay()
  const selectedCalendarDate = archive.find((day) => day.date === calendarSelectedDate)
  const selectedCalendarResults = selectedCalendarDate?.child || calendarResults
  const primaryCalendarResults = ['12:01:00', '16:30:00'].map((time) => selectedCalendarResults.find((entry) => entry.time === time))
  const archiveDates = new Map(archive.map((day) => [day.date, day.child || []]))
  const settledCount = results.filter((result) => result.twod && result.twod !== '--').length
  const isPositive = numeric(live?.set) != null && numeric(results.find((item) => item.twod !== '--')?.set) != null
    ? numeric(live.set) >= numeric(results.find((item) => item.twod !== '--')?.set)
    : true
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <aside className="sidebar">
        <a href="#" className="brand" aria-label="Thai 2D home">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.5} /></span>
          <span>thai<span className="brand-accent">2D</span></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <button type="button" aria-label="Today" title="Today" onClick={() => setPage('today')} className={`nav-item ${page === 'today' ? 'active' : ''}`}><LayoutDashboard size={18} />Today</button>
        <button type="button" aria-label="History" title="History" onClick={() => setPage('history')} className={`nav-item ${page === 'history' ? 'active' : ''}`}><History size={18} />History</button>
        <button type="button" aria-label="Calendar" title="Calendar" onClick={() => setPage('calendar')} className={`nav-item ${page === 'calendar' ? 'active' : ''}`}><CalendarDays size={18} />Calendar</button>
        <a href="https://docs.thaistock2d.com/" target="_blank" rel="noreferrer" aria-label="API documentation" title="API documentation" className="nav-item">
          <ExternalLink size={18} />API docs
        </a>
        <div className="sidebar-bottom">
          <div className="market-status-card">
            <span className={`status-dot ${connection === 'online' ? '' : 'muted'}`} />
            <div><strong>{connection === 'online' ? 'API connected' : connection === 'connecting' ? 'Connecting…' : 'Connection issue'}</strong><small>thaistock2d.com</small></div>
            {connection === 'online' ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>
          <div className="sidebar-foot">Market data provided by<br />ThaiStock2D API</div>
        </div>
      </aside>

      <main className="main-content" id={page}>
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page === 'today' ? 'Today' : page === 'history' ? 'History' : 'Calendar'}</strong></div>
          <div className="topbar-right">
            <div className="clock-display"><Clock3 size={15} /><span>{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span className="timezone">LOCAL</span></div>
            <button className="icon-button" aria-label="Market notifications" onClick={() => toast.fire({ icon: 'info', title: 'You’re all caught up' })}><Bell size={17} /></button>
            <div className="avatar">2D</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" />THAILAND MARKET</div>
            <h1>{page === 'today' ? 'Market overview' : page === 'history' ? 'Result history' : 'Results calendar'}</h1>
            <p className="page-subtitle"><CalendarDays size={15} />{page === 'today' ? dateLabel(marketDate) : page === 'history' ? 'Browse recent daily results' : 'Daily midday and closing results'}</p>
          </div>
          <button className="refresh-button" onClick={() => page === 'today' ? loadLive(true) : loadArchive()} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh data'}</span>
          </button>
        </section>

        {(page === 'today' ? loadError : archiveError) && (
          <div className="error-banner" role="status">
            <WifiOff size={16} /><span>{page === 'today' ? loadError : archiveError}. Showing the latest available data.</span>
            <button onClick={() => page === 'today' ? loadLive(true) : loadArchive()}>Try again</button>
          </div>
        )}

        {page === 'today' && <>
        <section className="overview-grid">
          <div className="live-card">
            <div className="live-card-top">
              <div className="live-indicator"><span className={`pulse-dot ${connection !== 'online' ? 'pulse-muted' : ''}`} />LIVE MARKET</div>
              <div className="live-card-actions">
                <span className="live-date">{marketDate || '—'}</span>
                <button type="button" className={`voice-toggle ${voiceAlerts ? 'enabled' : ''}`}
                  aria-pressed={voiceAlerts} aria-label={voiceAlerts ? 'Turn off voice alerts' : 'Turn on voice alerts'}
                  title={voiceAlerts ? 'Turn off voice alerts' : 'Turn on voice alerts'}
                  onClick={() => {
                    if (!('speechSynthesis' in window)) {
                      toast.fire({ icon: 'error', title: 'Voice alerts are not supported in this browser' })
                      return
                    }
                    setVoiceAlerts((enabled) => !enabled)
                    toast.fire({ icon: 'info', title: voiceAlerts ? 'Voice alerts turned off' : 'Voice alerts turned on' })
                  }}>
                  {voiceAlerts ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  <span>Voice {voiceAlerts ? 'on' : 'off'}</span>
                </button>
              </div>
            </div>
            <div className="live-card-content">
              <div className="live-number-block">
                <div className="live-number-label">CURRENT 2D RESULT</div>
                <div className={`live-number ${!live ? 'number-loading' : ''}`}>{live?.twod || '––'}</div>
                <div className={`live-change ${isPositive ? 'change-up' : 'change-down'}`}>
                  {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{connection === 'online' ? 'Market is updating' : 'Waiting for market data'}</span>
                </div>
              </div>
            </div>
            <div className="live-card-footer">
              <span><span className="footer-dot" />Live price</span>
              <span>Last update <strong>{lastUpdated ? lastUpdated.toLocaleTimeString('en-GB') : '—'}</strong></span>
              <span>Auto-refresh <strong>10 sec</strong></span>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div><div className="section-kicker">TODAY’S SCHEDULE</div><h2>Session results</h2></div>
            <span className="results-count"><span />{settledCount} of 4 published</span>
          </div>
          <div className="sessions-grid">
            {sessions.map((session, index) => {
              const result = results[index]
              const isPublished = Boolean(result?.twod && result.twod !== '--')
              return (
                <article className={`session-card ${isPublished ? 'session-published' : ''}`} key={session.time}>
                  <div className="session-card-head"><span className={`session-time-icon ${isPublished ? 'is-published' : ''}`}><Clock3 size={15} /></span><span className="session-period">{session.period}</span></div>
                  <div className="session-label">{session.label} session</div>
                  <div className="session-time">{session.time}{session.time === '11:00' && <span> AM</span>}{session.time === '12:01' && <span> PM</span>}</div>
                  <div className="session-result-row">
                    <span className="result-caption">2D result</span>
                    {isPublished
                      ? <span className="session-number">{result.twod}</span>
                      : <span className="pending-badge"><span />Pending</span>}
                  </div>
                  {isPublished && <div className="session-set">SET <strong>{displayNumber(result.set)}</strong><span>·</span> VALUE <strong>{displayNumber(result.value)}</strong></div>}
                </article>
              )
            })}
          </div>
        </section>

        </>}

        {page === 'history' && <section className="history-section page-panel">
          <div className="section-heading history-heading">
            <div><div className="section-kicker">DAILY RESULTS</div><h2>Recent result history</h2><p className="history-subtitle">Filter the latest published results by date and session.</p></div>
            <div className="history-controls">
              <div className="date-filter-wrap">
                <CalendarDays size={14} />
                <input aria-label="Filter results by date" type="date" value={historyDateFilter === 'all' ? '' : historyDateFilter}
                  max={marketDate} onChange={(event) => { setHistoryDateFilter(event.target.value || 'all'); setHistoryPage(1) }} />
                {historyDateFilter !== 'all' && <button type="button" aria-label="Clear date filter" onClick={() => { setHistoryDateFilter('all'); setHistoryPage(1) }}>All dates</button>}
              </div>
              <div className="filter-select-wrap">
                <select aria-label="Filter results by session" value={historySessionFilter} onChange={(event) => { setHistorySessionFilter(event.target.value); setHistoryPage(1) }}>
                  <option value="all">All sessions</option>
                  <option value="11:00">11:00 AM</option><option value="12:01">12:01 PM</option>
                  <option value="15:00">15:00</option><option value="16:30">16:30</option>
                </select><ChevronDown size={14} />
              </div>
            </div>
          </div>
          <div className="history-table-wrap">
            <table className="history-table">
              <thead><tr><th>DATE</th><th>SESSION</th><th>2D RESULT</th><th>SET INDEX</th><th>TRADE VALUE</th></tr></thead>
              <tbody>
                {pageHistoryRows.length > 0 ? pageHistoryRows.map((entry, index) => (
                  <tr key={`${entry.date}-${entry.time}-${index}`}>
                    <td>{entry.date}</td><td>{entry.time?.slice(0, 5) || '—'}</td>
                    <td><span className="history-number">{entry.twod || '—'}</span></td>
                    <td>{displayNumber(entry.set)}</td><td>{displayNumber(entry.value)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" className="empty-state">{archiveLoading || historyDateLoading ? 'Loading daily results…' : historyDateError || 'No results match these filters.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>Showing <strong>{historyRows.length ? (currentHistoryPage - 1) * HISTORY_PAGE_SIZE + 1 : 0}–{Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, historyRows.length)}</strong> of <strong>{historyRows.length}</strong> results</span>
            <div className="pagination" aria-label="History pages">
              <button type="button" aria-label="Previous page" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button>
              {Array.from({ length: historyPageCount }, (_, index) => index + 1).map((number) => (
                <button type="button" key={number} aria-label={`Page ${number}`} aria-current={number === currentHistoryPage ? 'page' : undefined}
                  className={number === currentHistoryPage ? 'current' : ''} onClick={() => setHistoryPage(number)}>{number}</button>
              ))}
              <button type="button" aria-label="Next page" disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage((current) => Math.min(historyPageCount, current + 1))}><ChevronRight size={14} /></button>
            </div>
          </div>
        </section>}

        {page === 'calendar' && <section className="calendar-layout">
          <div className="calendar-panel">
            <div className="calendar-panel-heading">
              <div><div className="section-kicker">RESULTS BY DATE</div><h2>Daily calendar</h2></div>
              <div className="calendar-month-controls">
                <button aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
                <strong>{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
                <button aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
              {Array.from({ length: calendarOffset }, (_, index) => <div className="calendar-empty" key={`empty-${index}`} />)}
              {Array.from({ length: calendarDays }, (_, index) => {
                const dayNumber = index + 1
                const isoDate = `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
                const values = archiveDates.get(isoDate) || []
                const midday = values.find((entry) => entry.time === '12:01:00')?.twod
                const closing = values.find((entry) => entry.time === '16:30:00')?.twod
                const isFuture = Boolean(marketDate && isoDate > marketDate)
                return (
                  <button type="button" disabled={isFuture} key={isoDate} onClick={() => setCalendarSelectedDate(isoDate)}
                    className={`calendar-day ${calendarSelectedDate === isoDate ? 'selected' : ''} ${isoDate === marketDate ? 'is-today' : ''} ${isFuture ? 'future' : ''}`}>
                    <span className="calendar-day-number">{dayNumber}</span>
                    {(midday || closing) && <span className="calendar-day-results">
                      <span className="calendar-result-line midday-line"><span className="calendar-result-time">12:00</span><strong className="calendar-result-value">{midday || '—'}</strong></span>
                      <span className="calendar-result-line closing-line"><span className="calendar-result-time">16:30</span><strong className="calendar-result-value">{closing || '—'}</strong></span>
                    </span>}
                  </button>
                )
              })}
            </div>
            <div className="calendar-legend"><span><i className="legend-midday" />12:00</span><span><i className="legend-closing" />16:30</span><span>Published results from API</span></div>
          </div>
          <div className="calendar-detail-panel">
            <div className="section-kicker">SELECTED DATE</div>
            <h2>{dateLabel(calendarSelectedDate)}</h2>
            <p className="history-subtitle">Daily results for 12:00 and 16:30</p>
            {calendarLoading ? <div className="calendar-empty-detail">Loading results…</div> : calendarError
              ? <div className="calendar-empty-detail error-text">{calendarError}</div>
              : <div className="calendar-result-list">
                  {primaryCalendarResults.map((result, index) => {
                    const session = sessions[index === 0 ? 1 : 3]
                    return <article className={`calendar-result-card ${index === 0 ? 'midday-result' : 'closing-result'}`} key={session.time}>
                      <div><span className="session-time-icon is-published"><Clock3 size={15} /></span><div><strong className="calendar-session-time">{session.time === '12:01' ? '12:00' : session.time}</strong><small>{session.label} session</small></div></div>
                      {result?.twod && result.twod !== '--'
                        ? <><span className="calendar-result-number">{result.twod}</span><div className="calendar-result-meta"><span>SET <strong>{displayNumber(result.set)}</strong></span><span>VALUE <strong>{displayNumber(result.value)}</strong></span></div></>
                        : <span className="pending-badge"><span />{calendarSelectedDate > (marketDate || '') ? 'Upcoming' : 'No result'}</span>}
                    </article>
                  })}
                </div>}
          </div>
        </section>}

        <footer className="page-footer"><span>Thai 2D market dashboard</span><span>Data refreshes automatically <span className="footer-dot" /></span></footer>
      </main>
    </div>
  )
}

export default App
