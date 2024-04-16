import init, { one_line_solver } from "./one_continuous_line.js"

init().then(_ => {
    postMessage({
        "status": "ready",
        "data": null
    })

    onmessage = e => {
        const graphLines = e.data.graphLines
        const numOfAnswers = e.data.numOfAnswers
        const inputString = e.data.inputString

        var solutions: string[][] = []
        var tmp: string[] = []

        for (var i = 0; i < graphLines.length; i++) {
            if (tmp.length >= Number(numOfAnswers))
                break

            const out = one_line_solver(
                inputString, i,
                Number(numOfAnswers)
            )
            if (out.trim() == "") continue

            for (const i of out.split("/")) {
                tmp.push(i)
            }
        }

        solutions = tmp.filter(v => (v.trim() != "")).map(v => v.split(","))
        solutions = solutions.slice(0, numOfAnswers)
        postMessage({
            "status": "finished",
            "data": solutions
        })
    }
})
