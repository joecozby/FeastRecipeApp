import { createLogger, format, transports } from 'winston'

const { combine, timestamp, errors, json, colorize, simple } = format

const isDev = process.env.NODE_ENV !== 'production'

const logger = createLogger({
  level: isDev ? 'debug' : 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  transports: [
    new transports.Console({
      format: isDev
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
  ],
})

export default logger
