#!/usr/bin/env node
import { spawnAuspex } from "./run.mjs"

spawnAuspex("src/cli.ts", process.argv.slice(2))
