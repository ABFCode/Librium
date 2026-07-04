// Port of errors.go — sentinel errors as named Error instances.
export const ErrEmptyInput = new Error('empty input')
export const ErrInvalidZip = new Error('invalid zip')
export const ErrMissingContainer = new Error('missing container')
export const ErrNoRootfile = new Error('no rootfile found')
export const ErrMalformedOPF = new Error('malformed opf')
export const ErrMissingManifest = new Error('missing manifest')
export const ErrNoSpine = new Error('no spine content found')
export const ErrNoCover = new Error('no cover found')
