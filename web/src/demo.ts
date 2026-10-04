// Demo mode: answers the API calls in the browser with the seed data, so the app
// can run as a static site without the Express server. Changes last until reload.
import { API_URL } from './config'
import { users, customers, buildFeedback, notes as seedNotes, noteCreatedAt } from '../../server/src/seed-data'

export const DEMO_LOGIN = { email: users[0].email, password: users[0].password }

const now = Date.now()
const people = users.map((u, i) => ({ id: i + 1, email: u.email, name: u.name, role: u.role }))
const clients = customers.map((c, i) => ({ id: i + 1, ...c }))
const feedback = buildFeedback(now).map((f) => ({ ...f }))
const notes = seedNotes.map((n, i) => ({ id: i + 1, ...n, created_at: noteCreatedAt(now, i) }))
const PAGE_SIZE = 10

function serialize(f: (typeof feedback)[number]) {
  const c = clients[f.customer_id - 1]
  const assignee = people.find((u) => u.id === f.assignee_id)
  return { ...f, customer_name: c.name, customer_email: c.email, assignee_name: assignee?.name ?? null }
}

function withAuthor(n: (typeof notes)[number]) {
  const author = people.find((u) => u.id === n.author_id)
  return { ...n, author_name: author?.name ?? null, author_email: author?.email ?? null }
}

function filtered(params: URLSearchParams) {
  const status = params.get('status') || 'all'
  const q = (params.get('q') || '').trim().toLowerCase()
  return feedback
    .map(serialize)
    .filter((f) => status === 'all' || f.status === status)
    .filter((f) => !q || [f.message, f.customer_name, f.customer_email].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function csvCell(value: unknown) {
  let s = String(value ?? '')
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

// Picks the first sentence; the real server calls an LLM here.
function summary(message: string) {
  const text = message.replace(/<[^>]+>/g, '')
  const first = text.match(/^.*?[.!?](\s|$)/)?.[0] ?? text
  return `Demo summary (no model call): ${first.trim()}`
}

function handle(method: string, path: string, params: URLSearchParams, body: any, user: (typeof people)[number]) {
  let m: RegExpMatchArray | null

  if (method === 'GET' && path === '/feedback') {
    const page = Math.max(1, Number(params.get('page')) || 1)
    const items = filtered(params)
    return json({ items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: items.length, page })
  }
  if ((m = path.match(/^\/feedback\/(\d+)(\/\w+)?$/))) {
    const item = feedback.find((f) => f.id === Number(m![1]))
    if (!item) return json({ error: 'Not found' }, 404)
    const action = m[2]
    if (method === 'GET' && !action) return json(serialize(item))
    if (method === 'POST' && action === '/resolve') {
      item.status = body?.status || (item.status === 'open' ? 'resolved' : 'open')
      return json(serialize(item))
    }
    if (method === 'POST' && action === '/assignment') {
      item.assignee_id = body.assignee_id ?? null
      item.priority = body.priority ?? 'normal'
      item.due_at = body.due_at || null
      return json(serialize(item))
    }
    if (action === '/notes') {
      if (method === 'GET') {
        const list = notes.filter((n) => n.feedback_id === item.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
        return json({ notes: list.map(withAuthor) })
      }
      if (!body?.body?.trim()) return json({ error: 'Note body is required' }, 400)
      const note = {
        id: notes.length + 1,
        feedback_id: item.id,
        author_id: user.id,
        body: body.body,
        is_private: body.is_private ? 1 : 0,
        created_at: new Date().toISOString(),
      }
      notes.push(note)
      return json(withAuthor(note), 201)
    }
  }
  if (method === 'GET' && path === '/users') return json({ users: people })
  if (method === 'GET' && path === '/metrics') {
    const iso = new Date().toISOString()
    return json({
      open: feedback.filter((f) => f.status === 'open').length,
      resolved: feedback.filter((f) => f.status === 'resolved').length,
      urgent: feedback.filter((f) => f.priority === 'urgent').length,
      overdue: feedback.filter((f) => f.status === 'open' && f.due_at && f.due_at < iso).length,
    })
  }
  if ((m = path.match(/^\/customers\/(\d+)$/))) {
    const c = clients.find((x) => x.id === Number(m![1]))
    if (!c) return json({ error: 'Not found' }, 404)
    const history = feedback
      .filter((f) => f.customer_id === c.id)
      .map(serialize)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
    return json({ ...c, history })
  }
  if (method === 'POST' && path === '/summarize') {
    const item = feedback.find((f) => f.id === body?.id)
    if (!item) return json({ error: 'Feedback not found' }, 404)
    return json({ summary: summary(item.message) })
  }
  if (method === 'GET' && path === '/export.csv') {
    const header = ['id', 'customer', 'email', 'channel', 'priority', 'status', 'assignee', 'due_at', 'message']
    const rows = filtered(params).map((f) =>
      [f.id, f.customer_name, f.customer_email, f.channel, f.priority, f.status, f.assignee_name, f.due_at, f.message]
        .map(csvCell)
        .join(',')
    )
    return new Response([header.join(','), ...rows].join('\n'), { headers: { 'Content-Type': 'text/csv' } })
  }
  return json({ error: 'Not found' }, 404)
}

export function installDemo() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (!url.href.startsWith(API_URL)) return realFetch(input, init)

    const path = url.pathname.replace(new URL(API_URL).pathname.replace(/\/$/, ''), '')
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : undefined

    if (method === 'POST' && path === '/login') {
      const match = users.findIndex((u) => u.email === body?.email && u.password === body?.password)
      if (match < 0) return json({ error: 'Invalid email or password' }, 401)
      return json({ token: `demo-${match + 1}`, user: people[match] })
    }

    const auth = new Headers(init?.headers).get('Authorization') || ''
    const user = people[Number(auth.replace('Bearer demo-', '')) - 1]
    if (!user) return json({ error: 'Invalid token' }, 401)
    return handle(method, path, url.searchParams, body, user)
  }
}
