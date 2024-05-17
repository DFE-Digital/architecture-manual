require('dotenv').config()

const express = require('express')
const nunjucks = require('nunjucks')
const dateFilter = require('nunjucks-date-filter')
const markdown = require('nunjucks-markdown')
const marked = require('marked')
const GovukHTMLRenderer = require('govuk-markdown')
const bodyParser = require('body-parser')
const path = require('path')
const config = require('./app/config')
const forceHttps = require('express-force-https')
const compression = require('compression')
const routes = require('./app/routes')
const session = require('express-session')
const favicon = require('serve-favicon')
const PageIndex = require('./middleware/pageIndex')
const pageIndex = new PageIndex(config)

const app = express()
app.use(compression())

app.use(
  session({
    secret: process.env.sessionkey,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Note: `secure: true` in a production environment with HTTPS
  })
)

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(favicon(path.join(__dirname, 'public/assets/images', 'favicon.ico')))

app.set('view engine', 'html')
app.locals.serviceName = process.env.serviceName || 'Architecture manual' 

// Set up Nunjucks as the template engine
const nunjuckEnv = nunjucks.configure(
  [
    'app/views',
    'node_modules/govuk-frontend/dist/',
    'node_modules/dfe-frontend/packages/components'
  ],
  {
    autoescape: true,
    express: app
  }
)

nunjuckEnv.addFilter('date', dateFilter)
marked.setOptions({
  renderer: new GovukHTMLRenderer()
})
markdown.register(nunjuckEnv, marked.parse)


app.use(forceHttps)

// Set up static file serving for the app's assets
app.use('/assets', express.static('public/assets'))

app.use((req, res, next) => {
  if (req.url.endsWith('/') && req.url.length > 1) {
    const canonicalUrl = req.url.slice(0, -1)
    res.set('Link', `<${canonicalUrl}>; rel="canonical"`)
  }
  next()
})

app.use('/', routes)

// Render sitemap.xml in XML format
app.get('/sitemap.xml', (_, res) => {
  res.set({ 'Content-Type': 'application/xml' })
  res.render('sitemap.xml')
})

app.get('/robots.txt', (_, res) => {
  res.set({ 'Content-Type': 'text/plain' })
  res.render('robots.txt')
})


app.get('/search', (req, res) => {
  console.log(req.query.searchterm)
  const query = req.query.searchterm || ''
  const resultsPerPage = 10
  let currentPage = parseInt(req.query.page, 10)
  const results = pageIndex.search(query)
  console.log('Results: ' + results)
  console.log('Query: ' + query)

  const maxPage = Math.ceil(results.length / resultsPerPage)
  if (!Number.isInteger(currentPage)) {
    currentPage = 1
  } else if (currentPage > maxPage || currentPage < 1) {
    currentPage = 1
  }

  const startingIndex = resultsPerPage * (currentPage - 1)
  const endingIndex = startingIndex + resultsPerPage

  res.render('search.html', {
    currentPage,
    maxPage,
    query,
    results: results.slice(startingIndex, endingIndex),
    resultsLen: results.length
  })
})

if (config.env !== 'development') {
  setTimeout(() => {
    pageIndex.init()
  }, 2000)
}

// Your custom middleware to automatically save form data to session
function saveFormDataToSession(req, res, next) {
  if (req.method === 'POST') {
    req.session.data = {
      ...req.session.data, // Existing session data
      ...req.body // New form data
    }
  }
  next()
}

// Middleware to make formData globally available to all views
function makeFormDataGlobal(req, res, next) {
  // Perform a shallow merge of existing res.locals.data and session data
  res.locals.data = {
    ...res.locals.data, // Existing data
    ...req.session.data // Data from the session
  }
  next()
}

// Register the middlewares globally
app.use(saveFormDataToSession)
app.use(makeFormDataGlobal)


app.get(/\.html?$/i, function (req, res) {
  let path = req.path
  const parts = path.split('.')
  parts.pop()
  path = parts.join('.')
  res.redirect(path)
})

app.get(/^([^.]+)$/, function (req, res, next) {
  matchRoutes(req, res, next)
})

// Handle 404 errors
app.use(function (req, res, next) {
  res.status(404).render('error.html')
})

// Handle 500 errors
app.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).render('error.html')
})

// Try to match a request to a template, for example a request for /test
// would look for /app/views/test.html
// and /app/views/test/index.html

function renderPath(path, res, next) {
  // Try to render the path
  res.render(path, function (error, html) {
    if (!error) {
      // Success - send the response
      res.set({ 'Content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (!error.message.startsWith('template not found')) {
      // We got an error other than template not found - call next with the error
      next(error)
      return
    }
    if (!path.endsWith('/index')) {
      // Maybe it's a folder - try to render [path]/index.html
      renderPath(path + '/index', res, next)
      return
    }
    // We got template not found both times - call next to trigger the 404 page
    next()
  })
}

function matchRoutes(req, res, next) {
  let path = req.path
  path = path.substr(1)
  if (path === '') {
    path = 'index'
  }

  renderPath(path, res, next)
}

app.listen(config.port)
