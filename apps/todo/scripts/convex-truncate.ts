import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// All tables defined in convex/schema.ts
const ALL_TABLES = ['todos', 'sessions', 'sessionNodes', 'messages']

function usageAndExit(): never {
    console.log('Usage: tsx scripts/truncateConvexTable.ts <tableName> [--file <path>]')
    console.log('       tsx scripts/truncateConvexTable.ts --all')
    console.log('')
    console.log('Replaces the contents of the Convex table with the data from an empty JSON Lines file.')
    console.log('If --file is provided, that file will be used instead of generating a temporary file.')
    console.log('If --all is provided, truncates all tables: ' + ALL_TABLES.join(', '))
    process.exit(1)
}

function runConvexImport(tableName: string, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('bunx', ['convex', 'import', '--replace', '--yes', '--table', tableName, filePath], {
            stdio: 'inherit',
        })

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Convex import exited with code ${code}`))
            }
        })
    })
}

async function truncateTable(tableName: string, emptyFilePath: string): Promise<void> {
    console.log(`🔄 Truncating Convex table "${tableName}"...`)
    await runConvexImport(tableName, emptyFilePath)
    console.log(`✅ Table "${tableName}" successfully cleared.`)
}

async function main() {
    const args = process.argv.slice(2)

    if (args.length === 0) {
        usageAndExit()
    }

    const truncateAll = args.includes('--all')

    let tableName: string | undefined
    let providedFilePath: string | undefined

    if (!truncateAll) {
        const tableNameIndex = args.findIndex((arg) => !arg.startsWith('-'))
        if (tableNameIndex === -1) {
            usageAndExit()
        }
        tableName = args[tableNameIndex]

        for (let i = 0; i < args.length; i += 1) {
            if (args[i] === '--file') {
                const next = args[i + 1]
                if (!next) {
                    console.error('Error: --file option requires a path.')
                    usageAndExit()
                }
                providedFilePath = next
                break
            }
        }

        if (!tableName) {
            usageAndExit()
        }
    }

    const emptyFilePath = providedFilePath ?? join(tmpdir(), `convex-empty-${randomUUID()}.jsonl`)
    const shouldRemoveFile = !providedFilePath

    try {
        if (!providedFilePath) {
            // Ensure Convex receives an empty dataset.
            await writeFile(emptyFilePath, '')
        }

        if (truncateAll) {
            console.log(`🔄 Truncating all Convex tables...`)
            for (const table of ALL_TABLES) {
                await truncateTable(table, emptyFilePath)
            }
            console.log(`✅ All tables successfully cleared.`)
        } else {
            await truncateTable(tableName!, emptyFilePath)
        }
    } catch (error) {
        console.error('❌ Failed to truncate table.')
        if (error instanceof Error) {
            console.error(error.message)
        } else {
            console.error(error)
        }
        process.exitCode = 1
    } finally {
        if (shouldRemoveFile) {
            try {
                await unlink(emptyFilePath)
            } catch {
                // best effort cleanup
            }
        }
    }
}

// eslint-disable-next-line
main()