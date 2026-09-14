#!/usr/bin/env node
import { spawnAuspex } from "../examples/auspex-ts/bin/run.mjs"

spawnAuspex("src/cli.ts", process.argv.slice(2))
