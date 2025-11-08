import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { motion } from 'framer-motion'

export default function App() {
  const [repoInput, setRepoInput] = useState('facebook/react')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [repoMeta, setRepoMeta] = useState(null)
  const [languages, setLanguages] = useState([])
  const [contributors, setContributors] = useState([])
  const [commits, setCommits] = useState([])
  const [darkMode, setDarkMode] = useState(false)

  function buildHeaders() {
    const headers = { 'Accept': 'application/vnd.github.v3+json' }
    if (token && token.trim()) headers['Authorization'] = `token ${token.trim()}`
    return headers
  }

  function parseRepo(input) {
    if (!input) return null
    let trimmed = input.trim()
    try {
      if (trimmed.startsWith('http')) {
        const url = new URL(trimmed)
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
      } else {
        const parts = trimmed.split('/').filter(Boolean)
        if (parts.length === 2) return `${parts[0]}/${parts[1]}`
      }
    } catch (e) {}
    return null
  }

  async function fetchRepo(ownerRepo) {
    const url = `https://api.github.com/repos/${ownerRepo}`
    const res = await fetch(url, { headers: buildHeaders() })
    if (!res.ok) throw new Error(`Failed to fetch repo metadata: ${res.status}`)
    return res.json()
  }

  async function fetchLanguages(ownerRepo) {
    const url = `https://api.github.com/repos/${ownerRepo}/languages`
    const res = await fetch(url, { headers: buildHeaders() })
    if (!res.ok) throw new Error(`Failed to fetch languages: ${res.status}`)
    return res.json()
  }

  async function fetchContributors(ownerRepo) {
    const url = `https://api.github.com/repos/${ownerRepo}/contributors?per_page=30&anon=1`
    const res = await fetch(url, { headers: buildHeaders() })
    if (!res.ok) throw new Error(`Failed to fetch contributors: ${res.status}`)
    return res.json()
  }

  async function fetchCommits(ownerRepo, branch = 'main') {
    const url = `https://api.github.com/repos/${ownerRepo}/commits?per_page=100&sha=${branch}`
    const res = await fetch(url, { headers: buildHeaders() })
    if (!res.ok) throw new Error(`Failed to fetch commits: ${res.status}`)
    return res.json()
  }

  async function analyze() {
    setError(null)
    setLoading(true)
    setRepoMeta(null)
    setLanguages([])
    setContributors([])
    setCommits([])

    const ownerRepo = parseRepo(repoInput)
    if (!ownerRepo) {
      setError('Please provide a valid GitHub repository URL or owner/repo (e.g. facebook/react).')
      setLoading(false)
      return
    }

    try {
      const meta = await fetchRepo(ownerRepo)
      setRepoMeta(meta)

      const langsObj = await fetchLanguages(ownerRepo)
      const totalBytes = Object.values(langsObj).reduce((a,b)=>a+b,0) || 1
      const langData = Object.keys(langsObj).map(lang=>({ name: lang, bytes: langsObj[lang], pct: +(langsObj[lang]/totalBytes*100).toFixed(1) }))
      setLanguages(langData)

      const [contri, commitsData] = await Promise.all([
        fetchContributors(ownerRepo),
        fetchCommits(ownerRepo, meta.default_branch || 'main')
      ])
      setContributors(contri)

      const commitsByDay = {}
      commitsData.forEach(c=>{
        let date = new Date(c.commit.author?.date || c.commit.committer?.date)
        if (!date || isNaN(date)) return
        const day = date.toISOString().slice(0,10)
        commitsByDay[day] = (commitsByDay[day] || 0) + 1
      })
      const commitsSeries = Object.keys(commitsByDay).sort().map(day=>({ day, commits: commitsByDay[day] }))
      setCommits(commitsSeries)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportReport(format='json') {
    const report = { repo: repoMeta, languages, contributors: contributors.map(c=>({ login: c.login, contributions: c.contributions })), commits }
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repoMeta?.full_name || 'repo'}-git-analyzer.json`
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    if (format === 'csv') {
      const lines = ['login,contributions']
      (contributors || []).forEach(c => lines.push(`${c.login || 'anon'},${c.contributions || 0}`))
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repoMeta?.full_name || 'repo'}-contributors.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#8dd1e1', '#a4de6c', '#d0ed57', '#d88484']

  useEffect(()=>{ if (darkMode) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark') }, [darkMode])

  return (
    <div className={`min-h-screen p-6 ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800'}`}>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold">GitAnalyzer</h1>
            <p className="text-sm opacity-80">Quick analysis for any public GitHub repository — language breakdown, contributors, commit activity.</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <span>Dark</span>
              <input type="checkbox" checked={darkMode} onChange={e=>setDarkMode(e.target.checked)} className="ml-1"/>
            </label>
            <button className="text-sm underline" onClick={()=>{ navigator.clipboard.writeText('Need a token? Create one at github.com/settings/tokens') }}>Guide</button>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow">
            <label className="block text-xs mb-2">Repository (URL or owner/repo)</label>
            <div className="flex gap-2">
              <input className="flex-1 p-2 border rounded" value={repoInput} onChange={e=>setRepoInput(e.target.value)} placeholder="facebook/react or https://github.com/facebook/react" />
              <button onClick={analyze} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-60">{loading ? 'Analyzing...' : 'Analyze'}</button>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              <input value={token} onChange={e=>setToken(e.target.value)} placeholder="Personal access token (optional)" className="p-2 border rounded" />
              <button onClick={()=>{ setRepoInput('') }} className="p-2 border rounded">Clear</button>
            </div>
            {error && <p className="text-red-500 mt-3">{error}</p>}
            <p className="text-xs opacity-70 mt-2">Note: public repos only. Authenticated requests improve rate limits.</p>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <h3 className="font-semibold">Quick actions</h3>
            <div className="mt-3 flex flex-col gap-2">
              <button disabled={!repoMeta} onClick={()=>exportReport('json')} className="p-2 border rounded disabled:opacity-60">Export JSON</button>
              <button disabled={!repoMeta} onClick={()=>exportReport('csv')} className="p-2 border rounded disabled:opacity-60">Export Contributors CSV</button>
              <button onClick={()=>{ setRepoInput('vercel/next.js'); analyze() }} className="p-2 border rounded">Try sample (next.js)</button>
            </div>
          </div>
        </motion.div>

        {repoMeta && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="flex items-start gap-4">
                <img src={repoMeta.owner.avatar_url} alt="owner" className="w-16 h-16 rounded-full" />
                <div>
                  <h2 className="text-2xl font-semibold">{repoMeta.full_name}</h2>
                  <p className="text-sm opacity-80">{repoMeta.description}</p>
                  <div className="mt-2 text-xs opacity-70 flex gap-3">
                    <span>⭐ {repoMeta.stargazers_count}</span>
                    <span>🍴 {repoMeta.forks_count}</span>
                    <span>🧭 {repoMeta.default_branch}</span>
                    <span>📦 {Math.round((repoMeta.size || 0) / 1024)} MB (approx)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-medium mb-3">Commit activity (recent)</h3>
                {commits.length > 0 ? (
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={commits}>
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <ReTooltip />
                        <Bar dataKey="commits" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm opacity-70">No commit data available or repo has very few recent commits.</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
              <h3 className="font-medium mb-3">Languages</h3>
              {languages.length > 0 ? (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={languages} dataKey="bytes" nameKey="name" outerRadius={80} label>
                        {languages.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="mt-3 text-sm">
                    {languages.map(l => <li key={l.name} className="flex justify-between"><span>{l.name}</span><span>{l.pct}%</span></li>)}
                  </ul>
                </div>
              ) : (
                <p className="text-sm opacity-70">Language data not available.</p>
              )}
            </div>
          </motion.section>
        )}

        {contributors.length > 0 && (
          <section className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Top Contributors</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {contributors.slice(0,9).map((c) => (
                <div key={c.login || c.name} className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <div className="flex items-center gap-3">
                    <img src={c.avatar_url} className="w-10 h-10 rounded-full" alt="contributor" />
                    <div>
                      <div className="font-medium">{c.login || c.name || 'anon'}</div>
                      <div className="text-xs opacity-70">Contributions: {c.contributions}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-8 text-center text-xs opacity-70">
          <p>Made with care — small, useful tool for quick repo insight. For deep analysis, clone locally and run static analyzers.</p>
        </footer>
      </div>
    </div>
  )
}
