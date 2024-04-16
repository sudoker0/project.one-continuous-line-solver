function qSel<T extends Element>(selector: string) {
    return document.querySelector<T>(selector)
}

enum MouseButton {
    LEFT = 1,
    MIDDLE = 4,
    RIGHT = 2
}

type GraphNodes = {
    [id in string]: {
        x: number,
        y: number,
        new: boolean
    }
}

type WorkerResponse = {
    status: "ready" | "finished",
    data: any
}

type GraphLines = {
    from: string,
    to: string
}[]

const canvas =
    qSel<HTMLCanvasElement>("#canvas")
const solveButton =
    qSel<HTMLButtonElement>("#solve")
const numOfAnswersInput =
    qSel<HTMLInputElement>("#num_of_answers")
const solutionsContainer =
    qSel<HTMLElement>("#solutions")
const solutionsCount =
    qSel<HTMLElement>("#solutions_cnt")

const initializationOverlay =
    qSel<HTMLElement>("#initializing.overlay")
const solvingOverlay =
    qSel<HTMLElement>("#solving.overlay")

const controlPanel =
    qSel<HTMLElement>("#control")
const controlButton =
    qSel<HTMLButtonElement>("#control_button")
const clearAllButton =
    qSel<HTMLButtonElement>("#clear_all")

const worker = new Worker("script/worker.js", { type: "module" })

const canvasCtx = canvas?.getContext("2d")

const graphNodeColor = "#ffffff"
const graphLineColor = "#ff0000"
const selectedNodeColor = "#2574fc"
const backgroundColor = "#000000"
const graphLineThickness = 8
const graphNodeThickness = graphLineThickness * 1.2

var graphNodes: GraphNodes = {}
var graphLines: GraphLines = []

var isDrawingLine = false
var currentMousePos = {
    x: 0,
    y: 0
}
var prevMousePos = {
    x: null,
    y: null
}
var currentPointerId: number = -1

var prevNodeId: string = ""
var latestNodeId: string = ""
var selectedNodeId: string = ""

var idToNum = {}
var numToId = {}

var solutions: string[][] = []

function uuidv4() {
    return "10000000-1000-4000-8000-100000000000"
        .replace(/[018]/g, (c: string) =>
            (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4)
                .toString(16)
        )
}

function renderGraph(ctx: CanvasRenderingContext2D) {
    //? clear canvas
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    //? render lines
    for (const i of graphLines) {
        const fromNode = graphNodes[i.from]
        const toNode = graphNodes[i.to]
        ctx.beginPath()
        ctx.moveTo(fromNode.x, fromNode.y)
        ctx.lineTo(toNode.x, toNode.y)
        ctx.strokeStyle = graphLineColor
        ctx.lineWidth = graphLineThickness
        ctx.stroke()
        ctx.closePath()
    }

    //? render temp line
    if (
        isDrawingLine &&
        prevMousePos.x != null &&
        prevMousePos.y != null &&
        selectedNodeId == ""
    ) {
        ctx.beginPath()
        ctx.moveTo(prevMousePos.x, prevMousePos.y)
        ctx.lineTo(currentMousePos.x, currentMousePos.y)
        ctx.strokeStyle = graphLineColor
        ctx.lineWidth = graphLineThickness
        ctx.stroke()
        ctx.closePath()
    }

    //? render nodes
    for (const i in graphNodes) {
        ctx.beginPath()
        ctx.arc(
            graphNodes[i].x,
            graphNodes[i].y,
            graphNodeThickness,
            0,
            2 * Math.PI,
            false)
        ctx.fillStyle = graphNodeColor
        ctx.fill()
        ctx.closePath()
    }

    //? render selected node
    if (selectedNodeId != "") {
        ctx.beginPath()
        ctx.arc(
            graphNodes[selectedNodeId].x,
            graphNodes[selectedNodeId].y,
            graphNodeThickness,
            0,
            2 * Math.PI,
            false)
        ctx.fillStyle = selectedNodeColor
        ctx.fill()
        ctx.closePath()
    }
}

function findNode(x: number, y: number, safeDistForNodes = false) {
    var result: GraphNodes = {}
    var mul = safeDistForNodes ? 2 : 1
    var id = ""
    var found = false

    for (const i in graphNodes) {
        const dx = (graphNodes[i].x - x) ** 2
        const dy = (graphNodes[i].y - y) ** 2
        if (dx + dy > (graphNodeThickness * mul) ** 2) continue

        result[i] = graphNodes[i]
        id = i
        found = true
    }
    return {
        "found": found,
        "id": id,
    }
}

function findPath(from: string, to: string) {
    for (const i of graphLines) {
        if (
            (from == i.from && to == i.to) ||
            (from == i.to && to == i.from)
        ) {
            return true
        }
    }
    return false
}

function placeNode(x: number, y: number) {
    graphNodes[uuidv4()] = {
        x: x,
        y: y,
        new: true
    }
}

function deleteNode(x: number, y: number) {
    const foundNodes = findNode(x, y)
    if (foundNodes.found) {
        graphLines = graphLines.filter(v =>
            !(v.from == foundNodes.id || v.to == foundNodes.id))
        delete graphNodes[foundNodes.id]
    }

    selectedNodeId = ""
}

function validateOptions() {
    var numRegex = /^[0-9]+$/
    if (!numOfAnswersInput.value.match(numRegex)) {
        alert(
            "Error: \"Number of answers\" input is not a valid number"
        )
        return false
    }

    if (Number(numOfAnswersInput.value) > 100) {
        var areYouSure = confirm(
            `Warning: You have requested for a maximum of ${Number(numOfAnswersInput.value)} answers. This can slow down your browser, especially if your computer isn't powerful. Proceed?`
        )
        if (!areYouSure) return false
    }

    if (graphLines.length < 1) {
        alert(
            "Error: No detected shape in the canvas. Please add at least a line."
        )
        return false
    }

    if (Object.keys(graphNodes).length < 1) {
        alert(
            "Error: Insufficient number of nodes. Please add at least two nodes."
        )
        return false
    }
    return true
}

function processWorkerData() {
    while (solutionsContainer.firstChild) {
        solutionsContainer.removeChild(solutionsContainer.lastChild)
    }

    var cnt = 0
    for (var s of solutions) {
        cnt++

        const detailsElm = document.createElement("details")

        const summaryElm = document.createElement("summary")
        summaryElm.innerText = `Solutions #${cnt}`

        const ulElm = document.createElement("ul")

        const stepsRequiredElm = document.createElement("li")
        stepsRequiredElm.innerText = `Steps required: ${s.length}`

        const pathElm = document.createElement("li")
        pathElm.innerText = "Path: " + s.join(" -> ")

        const previewElm = document.createElement("li")
        const previewButtonElm = document.createElement("button")
        previewButtonElm.onclick = () => { previewOnCanvas(s) }
        previewButtonElm.innerText = "Preview on canvas"
        previewElm.append(previewButtonElm)

        ulElm.append(stepsRequiredElm, pathElm, previewElm)
        detailsElm.append(summaryElm, ulElm)

        solutionsContainer.append(detailsElm)
    }

    solutionsCount.innerText = `${cnt} solutions!`
    solvingOverlay.classList.add("hidden")
}

function pointerDownEvt(x: number, y: number, buttons: MouseButton) {
    switch (buttons) {
        case MouseButton.LEFT:
            var foundNodes = findNode(x, y, true)
            if (!foundNodes.found && selectedNodeId == "")
                placeNode(x, y)

            foundNodes = findNode(x, y, true)
            if (!foundNodes.found) return

            latestNodeId = foundNodes.id
            prevNodeId = ""

            isDrawingLine = true
            prevMousePos.x = graphNodes[foundNodes.id].x
            prevMousePos.y = graphNodes[foundNodes.id].y

            currentMousePos.x = x
            currentMousePos.y = y
            break
        case MouseButton.RIGHT:
            deleteNode(x, y)
            break
    }
}

function pointerMoveEvt(x: number, y: number, buttons: MouseButton) {
    if (buttons != MouseButton.LEFT) return
    prevNodeId = latestNodeId

    if (isDrawingLine) {
        currentMousePos.x = x
        currentMousePos.y = y
    }

    if (selectedNodeId != "") {
        graphNodes[selectedNodeId].x = x
        graphNodes[selectedNodeId].y = y

        canvas.style.cursor = "move"
    }
}

//! DOES NOT USE e.buttons
function pointerUpEvt(x: number, y: number, buttons: number) {
    if (buttons != 0) return
    var foundNodes = findNode(x, y, true)

    canvas.style.cursor = ""
    prevMousePos.x = null
    prevMousePos.y = null

    if (!foundNodes.found && selectedNodeId == "") {
        placeNode(x, y)
        foundNodes = findNode(x, y, true)
    }

    latestNodeId = foundNodes.id

    if (prevNodeId == "") select_node: {
        if (graphNodes[latestNodeId].new) {
            graphNodes[latestNodeId].new = false
            break select_node
        }

        if (selectedNodeId == "")
            selectedNodeId = latestNodeId
        else
            selectedNodeId = ""
    }

    if (foundNodes.found && prevNodeId != "" && prevNodeId != latestNodeId)
    block: {
        if (findPath(latestNodeId, prevNodeId)) break block

        graphLines.push({
            "from": prevNodeId,
            "to": foundNodes.id
        })
    }
}

function previewOnCanvas(path) {
    console.log(path)
}

canvas.addEventListener("contextmenu", e => {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
})

//* mouse handle

canvas.addEventListener("pointerdown", e => {
    const x = e.offsetX, y = e.offsetY
    pointerDownEvt(x, y, e.buttons)
})

canvas.addEventListener("pointermove", e => {
    const x = e.offsetX, y = e.offsetY
    pointerMoveEvt(x, y, e.buttons)
})

canvas.addEventListener("pointerup", e => {
    const x = e.offsetX, y = e.offsetY
    pointerUpEvt(x, y, e.button) //! DO NOT CONFUSE WITH e.buttons
})

// //* touch handle

// canvas.addEventListener("pointerdown", e => {
//     console.log(e.offsetX)
// })

// canvas.addEventListener("pointermove", e => {
    
// })

// canvas.addEventListener("pointerup", e => {
    
// })

worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
    switch (e.data.status) {
        case "ready":
            ready()
            break
        case "finished":
            solutions = e.data.data
            processWorkerData()
            break
    }
})

solveButton.addEventListener("click", _ => {
    const check = validateOptions()
    if (!check) return

    solvingOverlay.classList.remove("hidden")

    idToNum = {}
    numToId = {}

    var cnt = 0
    for (const i of Object.keys(graphNodes)) {
        idToNum[i] = cnt
        numToId[cnt] = i
        cnt++
    }


    var inputStr = ""
    for (const i of graphLines) {
        inputStr += `${idToNum[i.from]},${idToNum[i.to]}`
        inputStr += "/"
    }
    inputStr = inputStr.slice(0, -1)

    worker.postMessage({
        graphLines: graphLines,
        numOfAnswers: numOfAnswersInput.value,
        inputString: inputStr
    })
})

controlButton.addEventListener("click", () => {
    controlPanel.classList.toggle("off")
})

clearAllButton.addEventListener("click", () => {
    const areYouSure = confirm("Are you sure you want to clear all of the drawing on the canvas?")
    if (!areYouSure) return

    graphNodes = {}
    graphLines = []

    isDrawingLine = false
    currentMousePos = {
        x: 0,
        y: 0
    }
    prevMousePos = {
        x: null,
        y: null
    }
    prevNodeId = ""
    latestNodeId = ""
    selectedNodeId = ""

    idToNum = {}
    numToId = {}

    solutions = []
})

function ready() {
    console.log("ready")
    initializationOverlay.classList.add("hidden")
    loop()
}

function loop() {
    canvas.width = innerWidth
    canvas.height = innerHeight
    renderGraph(canvasCtx)
    requestAnimationFrame(loop)
}

setInterval(() => {
    console.log(graphNodes, graphLines, prevMousePos, selectedNodeId, latestNodeId)
}, 1000)