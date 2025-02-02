const fs = require('fs')

module.exports = (api, options) => {
  const { info, chalk, execa } = require('@vue/cli-shared-utils')

  api.registerCommand('test:e2e', {
    description: 'run end-to-end tests with nightwatch',
    usage: 'vue-cli-service test:e2e [options]',
    options: {
      '--url': 'run end-to-end tests against given url instead of auto-starting dev server',
      '--config': 'use custom nightwatch config file (overrides internals)',
      '--headless': 'use chrome or firefox in headless mode',
      '--parallel': 'enable parallel mode via test workers (only available in chromedriver)',
      '--use-selenium': 'use Selenium standalone server instead of chromedriver or geckodriver',
      '-e, --env': 'specify comma-delimited browser envs to run in (default: chrome)',
      '-t, --test': 'specify a test to run by name',
      '-f, --filter': 'glob to filter tests by filename'
    },
    details:
      `All Nightwatch CLI options are also supported.\n` +
      chalk.yellow(`https://nightwatchjs.org/guide/running-tests/#command-line-options`)
  }, (args, rawArgs) => {
    const argsToRemove = ['url', 'mode', 'headless', 'use-selenium', 'parallel']
    argsToRemove.forEach((toRemove) => removeArg(rawArgs, toRemove))

    return Promise.all([
      startDevServer(args, api),
      loadNightwatchConfig(rawArgs, api)
    ]).then((results) => {
      const { server, url } = results[0]
      let content = args.headless ? 'in headless mode' : ''
      if (args.parallel) {
        content += ' with concurrency'
      }

      info(`Running end-to-end tests ${content}...`)

      // expose dev server url to tests
      process.env.VUE_DEV_SERVER_URL = url

      if (rawArgs.indexOf('--env') === -1 && rawArgs.indexOf('-e') === -1) {
        rawArgs.push('--env', 'chrome')
      }

      if (args['with-selenium']) {
        process.env.VUE_NIGHTWATCH_USE_SELENIUM = '1'
      }

      if (args.headless) {
        process.env.VUE_NIGHTWATCH_HEADLESS = '1'
      }

      if (args.parallel) {
        process.env.VUE_NIGHTWATCH_CONCURRENT = '1'
      }

      const nightWatchBinPath = require.resolve('nightwatch/bin/nightwatch')
      const runner = execa(nightWatchBinPath, rawArgs, { stdio: 'inherit' })
      if (server) {
        runner.on('exit', () => server.close())
        runner.on('error', () => server.close())
      }

      if (process.env.VUE_CLI_TEST) {
        runner.on('exit', code => {
          process.exit(code)
        })
      }

      return runner
    })
  })
}

module.exports.defaultModes = {
  'test:e2e': 'production'
}

function startDevServer (args, api) {
  const { url } = args

  if (url) {
    return Promise.resolve({ url })
  }

  return api.service.run('serve')
}

async function loadNightwatchConfig (rawArgs, api) {
  if (rawArgs.indexOf('--config') === -1) {
    // expose user options to config file
    let userOptions
    const configFiles = [
      'nightwatch.config.js',
      'nightwatch.conf.js',
      'nightwatch.json'
    ].map((entry) => api.resolve(entry))

    const userOptionsPath = await findAsync(configFiles, fileExists)

    if (userOptionsPath) {
      userOptions = require(userOptionsPath)
    }

    process.env.VUE_NIGHTWATCH_USER_OPTIONS = JSON.stringify(userOptions || {})

    rawArgs.push('--config', require.resolve('./nightwatch.config.js'))
  }
}

async function findAsync (arr, callback) {
  while (arr.length) {
    const item = arr.shift()
    const result = await callback(item)

    if (result) {
      return item
    }
  }

  return false
}

async function fileExists (path) {
  try {
    const stats = await checkPath(path)

    return stats.isFile()
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false
    }

    throw err
  }
}

function checkPath (source) {
  return new Promise(function (resolve, reject) {
    fs.stat(source, function (err, stat) {
      if (err) {
        return reject(err)
      }

      resolve(stat)
    })
  })
}

function removeArg (rawArgs, argToRemove, offset = 1) {
  const matchRE = new RegExp(`^--${argToRemove}$`)
  const equalRE = new RegExp(`^--${argToRemove}=`)

  const index = rawArgs.findIndex(arg => matchRE.test(arg))
  if (index > -1) {
    rawArgs.splice(index, offset + (equalRE.test(rawArgs[index]) ? 1 : 0))
  }
}
