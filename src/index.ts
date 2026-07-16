import { setFailed } from '@actions/core'
import { run } from './main'

run().catch((error) => {
  setFailed(error instanceof Error ? error.message : String(error))
})
