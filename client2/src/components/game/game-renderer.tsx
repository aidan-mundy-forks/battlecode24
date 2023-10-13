import React from 'react'
import { useAppContext } from '../../app-context'
import { Vector } from '../../playback/Vector'
import { EventType, publishEvent, useListenEvent } from '../../app-events'
import * as cst from '../../constants'
import assert from 'assert'
import Tooltip from './tooltip'

export enum CanvasType {
    BACKGROUND = 'BACKGROUND',
    DYNAMIC = 'DYNAMIC',
    OVERLAY = 'OVERLAY'
}

const CANVAS_Z_INDICES = [0, 1, 2]

export const GameRenderer: React.FC = () => {
    const wrapperRef = React.useRef(null)
    const appContext = useAppContext()
    const canvases = React.useRef({} as Record<string, HTMLCanvasElement | null>)
    const game = appContext.state.activeGame
    const [tooltipCanvas, setTooltipCanvas] = React.useState<HTMLCanvasElement>()

    const getCanvasContext = (ct: CanvasType) => {
        return canvases.current[ct]?.getContext('2d')
    }

    // TODO: could potentially have performance settings that allows rendering
    // at a lower resolution and then upscaling
    const updateCanvasDimensions = (ct: CanvasType, dims: Vector) => {
        const elem = canvases.current[ct]
        if (!elem) return
        elem.width = dims.x * cst.TILE_RESOLUTION
        elem.height = dims.y * cst.TILE_RESOLUTION
        elem.getContext('2d')?.scale(cst.TILE_RESOLUTION, cst.TILE_RESOLUTION)
    }

    // Since this is a callback, we need to ensure we recreate the function when the
    // active match changes. Similarly, the event listener needs to be updated, which
    // will happen automatically via dependencies
    const render = React.useCallback(() => {
        const match = appContext.state.activeMatch
        if (!match) return

        const ctx = getCanvasContext(CanvasType.DYNAMIC)!
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        match.currentTurn.map.draw(ctx)
        match.currentTurn.bodies.draw(match.currentTurn, ctx)
        match.currentTurn.actions.draw(match.currentTurn, ctx)
    }, [appContext.state.activeMatch])
    useListenEvent(EventType.RENDER, render, [appContext.state.activeMatch])

    // We want to rerender if the match changes
    React.useEffect(() => {
        const match = appContext.state.activeMatch
        if (!match) return

        // Update canvases to reflect board size of new match
        updateCanvasDimensions(CanvasType.BACKGROUND, {
            x: match.currentTurn.map.width,
            y: match.currentTurn.map.height
        })
        updateCanvasDimensions(CanvasType.DYNAMIC, { x: match.currentTurn.map.width, y: match.currentTurn.map.height })

        // Redraw static background
        match.currentTurn.map.staticMap.draw(getCanvasContext(CanvasType.BACKGROUND)!)

        const noContextMenu = (e: MouseEvent) => {
            e.preventDefault()
        }
        if (canvases.current) {
            Object.values(canvases.current).filter(c => c).forEach((canvas) => {
                canvas!.addEventListener('contextmenu', noContextMenu)
            })
        }

        publishEvent(EventType.RENDER, {})

        return () => {
            if (canvases.current) {
                Object.values(canvases.current).filter(c => c).forEach((canvas) => {
                    canvas!.removeEventListener('contextmenu', noContextMenu)
                })
            }
        }
    }, [canvases, appContext.state.activeMatch])

    const eventToPoint = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
        const canvas = e.target as HTMLCanvasElement
        const rect = canvas.getBoundingClientRect()
        const map = game!.currentMatch!.currentTurn!.map ?? assert.fail('map is null in onclick')
        let x = Math.floor(((e.clientX - rect.left) / rect.width) * map.width)
        let y = Math.floor((1 - (e.clientY - rect.top) / rect.height) * map.height)
        x = Math.max(0, Math.min(x, map.width - 1))
        y = Math.max(0, Math.min(y, map.height - 1))
        return { x: x, y: y }
    }

    const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
        publishEvent(EventType.TILE_CLICK, eventToPoint(e))
    }

    const mouseDown = React.useRef(false)
    const lastFiredDragEvent = React.useRef({ x: -1, y: -1 })
    const onMouseUp = () => {
        mouseDown.current = false
        lastFiredDragEvent.current = { x: -1, y: -1 }
    }
    const onCanvasDrag = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
        const point = eventToPoint(e)
        if (point.x === lastFiredDragEvent.current.x && point.y === lastFiredDragEvent.current.y) return
        lastFiredDragEvent.current = point
        publishEvent(EventType.TILE_DRAG, point)
    }

    const mouseDownRightPrev = React.useRef(false)
    const mouseDownRight = (down: boolean, e?: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
        if (down === mouseDownRightPrev.current) return
        mouseDownRightPrev.current = down
        if (!down && e) onCanvasClick(e)
        publishEvent(EventType.CANVAS_RIGHT_CLICK, { down: down })
    }

    if (!canvases) return <></>

    // TODO: better support for strange aspect ratios, for now it is fine
    return (
        <div className="w-full h-screen flex items-center justify-center">
            {!game || !game.currentMatch ? (
                <p className="text-white text-center">Select a game from the queue</p>
            ) : (
                <div ref={wrapperRef} className="relative w-full h-full">
                    {Object.getOwnPropertyNames(CanvasType).map((ct, idx) => (
                        <canvas
                            className="absolute top-1/2 left-1/2 h-full max-w-full max-h-full"
                            style={{
                                transform: 'translate(-50%, -50%)',
                                zIndex: CANVAS_Z_INDICES[idx]
                            }}
                            key={`canv${ct}`}
                            ref={(ref) => {
                                canvases.current[ct] = ref
                                // TODO: there's def a better way to do this but idk how rn
                                if (ct == CanvasType.OVERLAY && ref && tooltipCanvas !== ref) {
                                    setTooltipCanvas(ref)
                                }
                            }}
                            onClick={onCanvasClick}
                            onMouseMove={(e) => {
                                if (mouseDown.current) onCanvasDrag(e)
                            }}
                            onMouseDown={() => {
                                mouseDown.current = true
                            }}
                            onMouseUp={() => onMouseUp}
                            onMouseLeave={(e) => {
                                onMouseUp()
                                mouseDownRight(false)
                            }}
                            onMouseDownCapture={(e) => {
                                if (e.button == 2) mouseDownRight(true, e)
                            }}
                            onMouseUpCapture={(e) => {
                                onMouseUp()
                                if (e.button == 2) mouseDownRight(false, e)
                            }}
                        />
                    ))}
                    <Tooltip canvas={tooltipCanvas} wrapperRef={wrapperRef} />
                </div>
            )}
        </div>
    )
}
