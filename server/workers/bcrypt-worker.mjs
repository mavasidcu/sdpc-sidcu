import bcrypt from "bcrypt";

export default function bcryptTask({ action, password, hash, saltRounds }) {
  if (action === "hash") {
    return bcrypt.hashSync(password, saltRounds);
  }
  if (action === "compare") {
    return bcrypt.compareSync(password, hash);
  }
  throw new Error(`bcrypt-worker: unknown action "${action}"`);
}
