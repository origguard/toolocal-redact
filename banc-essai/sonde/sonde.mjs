// Sonde de bout en bout : ouvre le dialogue de caviardage dans un vrai Chromium
// et relève ce qu'il affiche. Le mot de passe est lu dans .env, jamais affiché.
import { chromium } from 'playwright'
import fs from 'node:fs'

const port = process.argv[2] || '8033'
const scheme = process.argv[3] || 'light'
const env = Object.fromEntries(fs.readFileSync('/workspaces/toolocal-redact/banc-essai/.env', 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const HOST = `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
const BASE = `https://${HOST}`
const out = { port, scheme, console: [], erreurs: [], refus: [] }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: scheme, locale: 'fr-FR' })
await ctx.route(`${BASE}/**`, async (route) => {
  try {
    const r = await route.fetch({ url: route.request().url().replace(BASE, `http://127.0.0.1:${port}`), maxRedirects: 0 })
    const st = r.status()
    if (st >= 300 && st < 400 && r.headers().location) {
      const h = { 'content-type': 'text/html' }
      if (r.headers()['set-cookie']) h['set-cookie'] = r.headers()['set-cookie']
      const loc = new URL(r.headers().location, route.request().url()).href.replace('http://127.0.0.1:' + port, BASE)
      await route.fulfill({ status: 200, headers: h, body: '<meta http-equiv="refresh" content="0;url=' + loc + '">' })
    } else await route.fulfill({ response: r })
  } catch (e) { out.refus.push(String(e).slice(0, 200)); await route.abort() }
})
const page = await ctx.newPage()
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) out.console.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => out.erreurs.push(String(e).slice(0, 400)))

await page.goto(`${BASE}/login`)
await page.fill('input[name="user"]', env.NC_ADMIN_USER)
await page.fill('input[name="password"]', env.NC_ADMIN_PASSWORD)
await Promise.all([page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }), page.press('input[name="password"]', 'Enter')])
await page.goto(`${BASE}/apps/files/`)
const ligne = page.locator('tr[data-cy-files-list-row-name="contrat.pdf"]')
await ligne.waitFor({ timeout: 60000 })
// L'assistant de premier lancement de Nextcloud (sans rapport avec l'application)
// recouvre la page, parfois plusieurs secondes après le chargement : il est masqué.
await page.addStyleTag({ content: '#firstrunwizard { display: none !important; }' })
await page.waitForTimeout(3000)
out.assistantNextcloudMasque = await page.locator('#firstrunwizard').count() > 0
out.version = await page.evaluate(() => window.OC?.config?.version)
const listeAvant = await page.evaluate(() => [...document.querySelectorAll('tr[data-cy-files-list-row-name]')].map((r) => r.getAttribute('data-cy-files-list-row-name')))
await ligne.locator('[data-cy-files-list-row-actions] button').last().click()
const action = page.locator('[data-cy-files-list-row-action="toolocal-redact"]')
await action.waitFor({ timeout: 15000 })
await action.click()
await page.locator('#toolocal-redact-overlay').waitFor({ timeout: 30000 })
await page.waitForTimeout(8000)

const releve = () => page.evaluate(() => {
  const o = document.getElementById('toolocal-redact-overlay')
  const c = o.querySelector('canvas')
  let encre = -1
  try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; encre = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) encre++ } catch (e) { encre = String(e) }
  // Contraste WCAG de chaque élément qui porte du texte, contre le premier
  // fond opaque trouvé en remontant.
  const rvb = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const fondDe = (e) => { for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const f = rvb(getComputedStyle(n).backgroundColor); if (f.a >= 0.99) return f } return { r: 255, g: 255, b: 255, a: 1 } }
  const faibles = []
  let mesures = 0
  let plusPetite = 99
  for (const e of o.querySelectorAll('*')) {
    if (['STYLE', 'CANVAS', 'OPTION'].includes(e.tagName) || e.closest('[hidden]')) continue
    const propre = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!propre && !['TEXTAREA', 'SELECT'].includes(e.tagName)) continue
    const s = getComputedStyle(e)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    const t = lum(rvb(s.color)); const f = lum(fondDe(e))
    const ratio = (Math.max(t, f) + 0.05) / (Math.min(t, f) + 0.05)
    const corps = parseFloat(s.fontSize)
    mesures++
    if (corps < plusPetite) plusPetite = corps
    if (ratio < 4.5 && !e.disabled) faibles.push({ quoi: (e.id || e.className || e.tagName) + ' « ' + e.textContent.trim().slice(0, 40) + ' »', ratio: +ratio.toFixed(2), couleur: s.color })
  }
  const defile = o.querySelector('#tl-defile')
  const feuille = o.querySelector('#tl-feuille')
  defile.scrollTop = 0
  const rd = defile.getBoundingClientRect(); const rf = feuille.getBoundingClientRect()
  const lim = o.querySelector('#tl-limites')
  const rl = lim.getBoundingClientRect()
  return {
    badge: o.querySelector('#tl-detected-badge').textContent.trim(),
    alerteScan: o.querySelector('#tl-sans-texte').hidden ? null : o.querySelector('#tl-sans-texte').textContent,
    pageInfo: o.querySelector('#tl-page-info').textContent.trim(),
    canvas: [c.width, c.height], encre,
    hautDePageVisible: rf.top >= rd.top && rf.top < rd.bottom,
    pageDansLaLargeur: rf.right <= rd.right + 1 && rf.left >= rd.left - 1,
    limitesVisiblesSansDefiler: rl.top >= 0 && rl.bottom <= window.innerHeight && rl.height > 0,
    limites: lim.innerText,
    appliquerBloque: o.querySelector('#tl-btn-apply').disabled,
    raison: o.querySelector('#tl-etat').textContent,
    contraste: { mesures, faibles, plusPetitCorpsPx: plusPetite },
  }
})

out.ouverture = await releve()
await page.screenshot({ path: `/tmp/sonde/dialogue-${port}-${scheme}.png` })

// Sans rien à caviarder, le bouton doit rester bloqué même la case cochée.
await page.uncheck('#tl-chk-sensitive'); await page.uncheck('#tl-chk-gdpr')
await page.check('#tl-chk-relu')
await page.waitForTimeout(1500)
out.sansRien = await page.evaluate(() => ({ badge: document.querySelector('#tl-detected-badge').textContent, bloque: document.querySelector('#tl-btn-apply').disabled, raison: document.querySelector('#tl-etat').textContent }))
await page.check('#tl-chk-sensitive'); await page.check('#tl-chk-gdpr')
await page.waitForTimeout(1500)
out.caseCochee = await page.evaluate(() => ({ badge: document.querySelector('#tl-detected-badge').textContent, bloque: document.querySelector('#tl-btn-apply').disabled, raison: document.querySelector('#tl-etat').textContent }))

if (process.argv[4] === 'appliquer') {
  await page.click('#tl-btn-apply')
  await page.waitForTimeout(4000)
  let message = null
  for (let i = 0; i < 40 && !message; i++) {
    message = await page.evaluate(() => { const t = [...document.querySelectorAll('.toolocal-redact-message')].map((e) => e.textContent.trim()).filter(Boolean); return t.length ? t.join(' | ') : null })
    if (!message) await page.waitForTimeout(500)
  }
  out.messageDeFin = message
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `/tmp/sonde/apres-${port}-${scheme}.png` })
  const apres = await page.evaluate(() => [...document.querySelectorAll('tr[data-cy-files-list-row-name]')].map((r) => r.getAttribute('data-cy-files-list-row-name')))
  out.fichiersNouveaux = apres.filter((n) => !listeAvant.includes(n))
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
