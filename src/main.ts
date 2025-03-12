import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'
import { error, info } from '@actions/core'
import { getPackages } from '@manypkg/get-packages'

export async function main() {
  const flowPilotPath = path.resolve(cwd(), '.flow-pilot.json')
  if (!existsSync(flowPilotPath)) {
    error('The file .flow-pilot.json does not exist.')
    return
  }
  const flowPilotConfig = readFileSync(flowPilotPath, 'utf8')
  info(flowPilotConfig)

  const packages = await getPackages(cwd())
  info(JSON.stringify(packages, null, 2))
}
