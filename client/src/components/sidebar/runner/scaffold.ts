import { useEffect, useRef, useState } from 'react'
import { BATTLECODE_YEAR, SERVER_MAPS } from '../../../constants'
import { NativeAPI, nativeAPI } from './native-api-wrapper'
import { ConsoleLine } from './runner'
import { useForceUpdate } from '../../../util/react-util'
import WebSocketListener from './websocket'
import { useAppContext } from '../../../app-context'

const WINDOWS = process.env.ELECTRON && process.platform === 'win32'
const GRADLE_WRAPPER = WINDOWS ? 'gradlew.bat' : 'gradlew'

export type JavaInstall = {
    display: string
    path: string
}

type Scaffold = [
    setup: boolean,
    availableMaps: Set<string>,
    availablePlayers: Set<string>,
    javaInstalls: JavaInstall[],
    manuallySetupScaffold: () => Promise<void>,
    reloadData: () => void,
    scaffoldLoading: boolean,
    runMatch: (javaPath: string, teamA: string, teamB: string, selectedMaps: Set<string>) => Promise<void>,
    killMatch: (() => Promise<void>) | undefined,
    console: ConsoleLine[]
]

export function useScaffold(): Scaffold {
    const appContext = useAppContext()
    const [javaInstalls, setJavaInstalls] = useState<JavaInstall[]>([])
    const [availableMaps, setAvailableMaps] = useState<Set<string>>(new Set())
    const [availablePlayers, setAvailablePlayers] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState<boolean>(true)
    const [scaffoldPath, setScaffoldPath] = useState<string | undefined>(undefined)
    const matchPID = useRef<string | undefined>(undefined)
    const forceUpdate = useForceUpdate()
    const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
    const log = (line: ConsoleLine) =>
        setConsoleLines((prev) => (prev.length > 10000 ? [...prev.slice(1), line] : [...prev, line]))

    const [webSocketListener, setWebSocketListener] = useState<WebSocketListener | undefined>()

    async function manuallySetupScaffold() {
        if (!nativeAPI) return
        setLoading(true)
        const path = await nativeAPI.openScaffoldDirectory()
        setLoading(false)
        if (path) setScaffoldPath(path)
    }

    async function runMatch(javaPath: string, teamA: string, teamB: string, selectedMaps: Set<string>): Promise<void> {
        if (matchPID.current || !scaffoldPath) return
        setConsoleLines([])
        const newPID = await dispatchMatch(javaPath, teamA, teamB, selectedMaps, nativeAPI!, scaffoldPath!)
        matchPID.current = newPID
        forceUpdate()
    }

    async function killMatch(): Promise<void> {
        if (!matchPID.current) return
        await nativeAPI!.child_process.kill(matchPID.current)
        matchPID.current = undefined
        forceUpdate()
    }

    function reloadData() {
        if (!nativeAPI || !scaffoldPath) return
        setLoading(true)

        const dataPromise = fetchData(scaffoldPath)
        const javasPromise = nativeAPI.getJavas()
        Promise.allSettled([dataPromise, javasPromise]).then((res) => {
            if (res[0].status == 'fulfilled') {
                const [players, maps] = res[0].value
                setAvailablePlayers(players)
                setAvailableMaps(maps)
            }
            if (res[1].status == 'fulfilled') {
                const data = res[1].value
                const installs: JavaInstall[] = []
                for (let i = 0; i < data.length; i += 2) {
                    installs.push({
                        display: data[i],
                        path: data[i + 1]
                    })
                }
                setJavaInstalls(installs)
            }
            setLoading(false)
        })
    }

    useEffect(() => {
        if (!nativeAPI) {
            setLoading(false)
            return
        }

        findDefaultScaffoldPath(nativeAPI).then((path) => {
            setLoading(false)
            setScaffoldPath(path)
        })

        nativeAPI.child_process.onStdout(({ pid, data }) => {
            if (pid !== matchPID.current) return
            log({ content: data, type: 'output' })
        })
        nativeAPI.child_process.onStderr(({ pid, data }) => {
            if (pid !== matchPID.current) return
            log({ content: data, type: 'error' })
        })
        nativeAPI.child_process.onExit(({ pid, code, signal }) => {
            if (pid !== matchPID.current) return
            log({ content: `Exited with code ${code} | ${JSON.stringify(signal)}`, type: 'bold' })
            matchPID.current = undefined
            forceUpdate()
        })

        setWebSocketListener(
            new WebSocketListener((game) => {
                game.currentMatch = game.matches[0]
                appContext.setState({
                    ...appContext.state,
                    queue: appContext.state.queue.concat([game]),
                    activeGame: game,
                    activeMatch: game.currentMatch
                })
            })
        )
    }, [])

    useEffect(() => {
        reloadData()
    }, [scaffoldPath])

    return [
        !!scaffoldPath,
        availableMaps,
        availablePlayers,
        javaInstalls,
        manuallySetupScaffold,
        reloadData,
        loading,
        runMatch,
        matchPID.current ? killMatch : undefined,
        consoleLines
    ]
}

async function fetchData(scaffoldPath: string) {
    const path = nativeAPI!.path
    const fs = nativeAPI!.fs

    const wrapperPath = await path.join(scaffoldPath, GRADLE_WRAPPER)
    if (!(await fs.exists(wrapperPath))) throw new Error(`Can't find gradle wrapper: ${wrapperPath}`)

    const mapPath = await path.join(scaffoldPath, 'maps')
    if (!(await fs.exists(mapPath))) await fs.mkdir(mapPath)

    let sourcePath = await path.join(scaffoldPath, 'src')
    if (!(await fs.exists(sourcePath))) {
        sourcePath = await path.join(scaffoldPath, 'example-bots', 'src', 'main')

        if (!(await fs.exists(sourcePath))) {
            throw new Error(`Can't find source path: ${sourcePath}`)
        }
    }

    const playerFiles = await fs.getFiles(sourcePath, 'true')
    const sep = await path.getSeperator()
    const players = new Set(
        await Promise.all(
            playerFiles
                .filter(
                    (file) =>
                        file.endsWith(sep + 'RobotPlayer.java') ||
                        file.endsWith(sep + 'RobotPlayer.kt') ||
                        file.endsWith(sep + 'RobotPlayer.scala')
                )
                .map(async (file) => {
                    const relPath = await path.relative(sourcePath, file)
                    return relPath
                        .replace(/.RobotPlayer\.[^/.]+$/, '')
                        .replace(new RegExp(WINDOWS ? '\\\\' : '/', 'g'), '.')
                        .replace(new RegExp('/', 'g'), '.')
                })
        )
    )

    const mapExtension = '.map' + (BATTLECODE_YEAR % 100)
    const mapFiles = await fs.getFiles(mapPath)
    const maps = new Set(
        mapFiles
            .filter((file) => file.endsWith(mapExtension))
            .map((file) => file.substring(0, file.length - mapExtension.length))
            .map((file) => file.split(sep)[file.split(sep).length - 1])
            .concat(Array.from(SERVER_MAPS))
    )

    localStorage.setItem('scaffoldPath', scaffoldPath)

    return [players, maps]
}

async function findDefaultScaffoldPath(nativeAPI: NativeAPI): Promise<string | undefined> {
    const localPath = localStorage.getItem('scaffoldPath')
    if (localPath) return localPath

    const appPath = await nativeAPI.getRootPath()
    const path = nativeAPI.path
    const fs = nativeAPI.fs

    // npm run electron in client, if battlecode21-scaffold is located in same level as battlecode21
    const fromDev = await nativeAPI.path.join(
        await path.dirname(await path.dirname(await path.dirname(appPath))),
        'battlecode' + (BATTLECODE_YEAR % 100) + '-scaffold'
    )
    // scaffold/client/Battlecode Client[.exe]
    const fromWin = await path.dirname(await path.dirname(appPath))
    // scaffold/client/resources/app.asar
    const from3 = await path.dirname(await path.dirname(await path.dirname(appPath)))
    // scaffold/Battlecode Client.app/Contents/Resources/app.asar
    const fromMac = await path.dirname(
        await path.dirname(await path.dirname(await path.dirname(await path.dirname(appPath))))
    )

    if (await fs.exists(await path.join(fromDev, GRADLE_WRAPPER))) {
        return fromDev
    } else if (await fs.exists(await path.join(from3, GRADLE_WRAPPER))) {
        return from3
    } else if (await fs.exists(await path.join(fromWin, GRADLE_WRAPPER))) {
        return fromWin
    } else if (await fs.exists(await path.join(fromMac, GRADLE_WRAPPER))) {
        return fromMac
    }

    return undefined
}

async function dispatchMatch(
    javaPath: string,
    teamA: string,
    teamB: string,
    selectedMaps: Set<string>,
    nativeAPI: NativeAPI,
    scaffoldPath: string
): Promise<string> {
    const options = [
        `run`,
        `-x`,
        `unpackClient`,
        `-PwaitForClient=true`,
        `-PteamA=${teamA}`,
        `-PteamB=${teamB}`,
        `-Pmaps=${[...selectedMaps].join(',')}`,
        `-PvalidateMaps=false`,
        `-PenableProfiler=${false}`
    ]

    return await nativeAPI.child_process.spawn(scaffoldPath, javaPath, options)
}
