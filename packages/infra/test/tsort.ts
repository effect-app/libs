export function tsort(edges) {
  const nodes = new Map(), sorted = [], visited = new Map()

  const Node = function(id) {
    this.id = id
    this.afters = []
  }

  edges.forEach((v) => {
    const from = v[0], to = v[1]
    if (!nodes.get(from)) nodes.set(from, new Node(from))
    if (!nodes.get(to)) nodes.set(to, new Node(to))
    nodes.get(from).afters.push(to)
  })
  ;[...nodes.keys()].forEach(function visit(idstr, ancestors) {
    const node = nodes.get(idstr), id = node.id

    if (visited.get(idstr)) return
    if (!Array.isArray(ancestors)) ancestors = []

    ancestors.push(id)
    visited.set(idstr, true)
    node.afters.forEach(function(afterID) {
      if (ancestors.indexOf(afterID) >= 0) {
        throw new Error("closed chain : " + afterID + " is in " + id)
      }
      visit(
        afterID,
        ancestors.map(function(v) {
          return v
        })
      )
    })
    sorted.unshift(id)
  })

  return sorted
}

export const createEdges = <T extends { dependsOn?: any[] }>(dep: readonly T[]) => {
  const result = []
  dep.forEach((key) => {
    key.dependsOn?.forEach((n) => {
      result.push([n, key])
    })
  })
  return result
}

export const sort = <T>(dep: readonly (T & { dependsOn?: any[] })[]): readonly T[] => {
  const edges = createEdges(dep)
  const result = tsort(edges)
  return result.concat(dep.filter((v) => !result.includes(v)))
}
