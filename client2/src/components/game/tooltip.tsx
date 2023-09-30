import React, { Fragment, useEffect } from 'react'
import * as cst from '../../constants'
import { useMousePosition } from '../../util/mouse-pos'
import { useAppContext } from '../../app-context'
import { useListenEvent, EventType } from '../../app-events'
import { useForceUpdate } from '../../util/react-util'
import { Vector } from '../../playback/Vector'

type TooltipProps = {
    mapCanvas: HTMLCanvasElement | undefined
    overlayCanvas: HTMLCanvasElement | undefined
    wrapperRef: React.MutableRefObject<HTMLElement | null>
}

const Tooltip = ({ mapCanvas, overlayCanvas, wrapperRef }: TooltipProps) => {
    const mousePos = useMousePosition()
    const appContext = useAppContext()

    const forceUpdate = useForceUpdate()
    useListenEvent(EventType.TURN_PROGRESS, forceUpdate)

    const [clickedRobotId, setClickedRobotId] = React.useState<number>()

    let canvasAbsLeft = 0,
        canvasAbsTop = 0
    let tileLeft = 0,
        tileTop = 0
    let tileWidth = 0,
        tileHeight = 0
    let tileCol = -1,
        tileRow = -1

    if (mapCanvas && wrapperRef.current) {
        const canvasBoundingBox = mapCanvas.getBoundingClientRect()
        const wrapperBoundingBox = wrapperRef.current.getBoundingClientRect()

        const scalingFactorX = mapCanvas.width / canvasBoundingBox.width
        const scalingFactorY = mapCanvas.height / canvasBoundingBox.height

        const localX = (mousePos.x - canvasBoundingBox.left) * scalingFactorX
        const localY = (mousePos.y - canvasBoundingBox.top) * scalingFactorY

        tileCol = Math.floor(localX / cst.TILE_RESOLUTION)
        tileRow = Math.floor(localY / cst.TILE_RESOLUTION)

        canvasAbsLeft = canvasBoundingBox.left - wrapperBoundingBox.left
        canvasAbsTop = canvasBoundingBox.top - wrapperBoundingBox.top

        tileLeft = (tileCol * cst.TILE_RESOLUTION) / scalingFactorX + canvasAbsLeft
        tileTop = (tileRow * cst.TILE_RESOLUTION) / scalingFactorY + canvasAbsTop
        tileWidth = cst.TILE_RESOLUTION / scalingFactorX
        tileHeight = cst.TILE_RESOLUTION / scalingFactorY
    }

    function getHoveredBody() {
        return appContext.state?.activeMatch?.map
            ? appContext.state.activeMatch?.currentTurn.bodies.getByLocation(
              tileCol,
              appContext.state.activeMatch.map.dimension.height - 1 - tileRow
            )
        : undefined
    }

    function onClick(e: Event) {
        const hoveredBody = getHoveredBody()
        console.log(hoveredBody)

        if (hoveredBody === undefined) {
            if (clickedRobotId === undefined) setClickedRobotId(undefined)
            return
        }

        setClickedRobotId(hoveredBody.id)
    }

    useEffect(() => {
        if (overlayCanvas) {
            overlayCanvas.addEventListener('click', onClick)
            return () => {
                overlayCanvas.removeEventListener('click', onClick)
            }
        }
    }, [overlayCanvas, mousePos])

    if (!mapCanvas || !overlayCanvas || !wrapperRef.current) {
        return <Fragment />
    }

    const canvasBoundingBox = mapCanvas.getBoundingClientRect()
    const hoverVisible = !(
        mousePos.x < canvasBoundingBox.left ||
        mousePos.x > canvasBoundingBox.right ||
        mousePos.y < canvasBoundingBox.top ||
        mousePos.y > canvasBoundingBox.bottom
    )

    const hoveredBody = getHoveredBody()

    return (
        <Fragment>
            {hoverVisible && (
                <Fragment>
                    <div
                        className="absolute border-2 border-black z-10 cursor-pointer"
                        style={{
                            left: tileLeft + 'px',
                            top: tileTop + 'px',
                            width: tileWidth + 'px',
                            height: tileHeight + 'px',
                            pointerEvents: 'none'
                        }}
                    />
                    {hoveredBody && (
                        <div
                            className="absolute bg-black/70 z-20 text-white p-2 rounded-md text-xs"
                            style={{
                                left: tileLeft + tileWidth * 0.75 + 'px',
                                top: tileTop + tileHeight * 0.75 + 'px',
                            }}
                        >
                            {hoveredBody.onHoverInfo()}
                        </div>
                    )}
                </Fragment>
            )}
            {clickedRobotId != undefined && (
                <div
                    className="absolute bg-black z-20 text-white"
                    style={{
                        left: canvasAbsLeft + tileWidth * 0.75 + 'px',
                        top: canvasAbsTop + tileHeight * 0.75 + 'px'
                    }}
                >
                    {}
                </div>
            )}
        </Fragment>
    )
}

export default Tooltip
