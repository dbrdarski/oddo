/**
 * Mutable Directed Acyclic Graph for tracking .oddo file dependencies.
 * Edges point from dependent → dependency (file A imports B means edge A → B).
 */
export class DAG {
  constructor() {
    this.dependencies = new Map();
    this.dependents = new Map();
  }

  /**
   * Add a file with its resolved dependency edges.
   * @param {string} filePath - Absolute path of the file
   * @param {string[]} deps - Absolute paths of files this file imports
   */
  addFile(filePath, deps = []) {
    this.dependencies.set(filePath, new Set(deps));
    if (!this.dependents.has(filePath)) {
      this.dependents.set(filePath, new Set());
    }
    for (const dep of deps) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep).add(filePath);
    }
  }

  /**
   * Remove a file and all its edges (both inbound and outbound).
   * @param {string} filePath - Absolute path of the file to remove
   */
  removeFile(filePath) {
    const deps = this.dependencies.get(filePath);
    if (deps) {
      for (const dep of deps) {
        this.dependents.get(dep)?.delete(filePath);
      }
    }
    this.dependencies.delete(filePath);

    const myDependents = this.dependents.get(filePath);
    if (myDependents) {
      for (const dependent of myDependents) {
        this.dependencies.get(dependent)?.delete(filePath);
      }
    }
    this.dependents.delete(filePath);
  }

  /**
   * Update a file's dependency edges. Removes old edges and adds new ones.
   * @param {string} filePath - Absolute path of the file
   * @param {string[]} newDeps - New resolved dependency paths
   */
  updateFile(filePath, newDeps = []) {
    const oldDeps = this.dependencies.get(filePath);
    if (oldDeps) {
      for (const dep of oldDeps) {
        this.dependents.get(dep)?.delete(filePath);
      }
    }
    this.dependencies.set(filePath, new Set(newDeps));
    for (const dep of newDeps) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep).add(filePath);
    }
  }

  /**
   * Get all files that transitively depend on the given file (downstream).
   * @param {string} filePath - Absolute path of the file
   * @returns {Set<string>} All transitive dependents
   */
  getDownstream(filePath) {
    const result = new Set();
    const queue = [filePath];
    while (queue.length > 0) {
      const current = queue.pop();
      const deps = this.dependents.get(current);
      if (!deps) continue;
      for (const dep of deps) {
        if (!result.has(dep)) {
          result.add(dep);
          queue.push(dep);
        }
      }
    }
    return result;
  }

  /**
   * Returns all files in topological order (dependencies before dependents).
   * Optionally filters to a subset of files.
   * @param {Set<string>} [subset] - If provided, only include these files (but respect ordering)
   * @returns {string[]} Files in topological order
   * @throws {Error} If a cycle is detected
   */
  topologicalOrder(subset) {
    const inDegree = new Map();
    const adjacency = new Map();
    const nodes = subset || new Set(this.dependencies.keys());

    for (const node of nodes) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }

    for (const node of nodes) {
      const deps = this.dependencies.get(node);
      if (!deps) continue;
      for (const dep of deps) {
        if (nodes.has(dep)) {
          adjacency.get(dep).push(node);
          inDegree.set(node, inDegree.get(node) + 1);
        }
      }
    }

    const queue = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const order = [];
    while (queue.length > 0) {
      const node = queue.shift();
      order.push(node);
      for (const dependent of adjacency.get(node)) {
        const newDegree = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) queue.push(dependent);
      }
    }

    if (order.length !== nodes.size) {
      const remaining = [...nodes].filter(n => !order.includes(n));
      throw new Error(`Circular dependency detected involving: ${remaining.join(', ')}`);
    }

    return order;
  }

  /**
   * Check if the graph contains a cycle.
   * @returns {string[]|null} Cycle path if found, null otherwise
   */
  hasCycle() {
    try {
      this.topologicalOrder();
      return null;
    } catch (e) {
      const match = e.message.match(/involving: (.+)/);
      return match ? match[1].split(', ') : [];
    }
  }

  /** @returns {string[]} All file paths in the DAG */
  allFiles() {
    return [...this.dependencies.keys()];
  }

  /**
   * Serialize the DAG for disk persistence.
   * @returns {object} Serializable representation
   */
  serialize() {
    const deps = {};
    for (const [file, depSet] of this.dependencies) {
      deps[file] = [...depSet];
    }
    return { dependencies: deps };
  }

  /**
   * Restore a DAG from serialized data.
   * @param {object} data - Output from serialize()
   * @returns {DAG}
   */
  static deserialize(data) {
    const dag = new DAG();
    if (data?.dependencies) {
      for (const [file, deps] of Object.entries(data.dependencies)) {
        dag.addFile(file, deps);
      }
    }
    return dag;
  }
}
