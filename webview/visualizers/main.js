export function init() {
  ctx.visualizersView.init()
  ctx.visualizersNode.init()
  ctx.visualizersBeam.init()
  ctx.visualizersMesh.init()
  ctx.visualizersTriangle.init()
}

export function dispose() {
  ctx.visualizersView.dispose()
  ctx.visualizersNode.dispose()
  ctx.visualizersBeam.dispose()
  ctx.visualizersMesh.dispose()
  ctx.visualizersTriangle.dispose()
}

export function onConfigChanged() {
  ctx.visualizersView.onConfigChanged()
  ctx.visualizersNode.onConfigChanged()
  ctx.visualizersBeam.onConfigChanged()
  ctx.visualizersMesh.onConfigChanged()
  ctx.visualizersTriangle.onConfigChanged()
}
