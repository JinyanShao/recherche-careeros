declare module 'write-file-atomic' {
  type WriteFileAtomicOptions = {
    encoding?: BufferEncoding | null;
    fsync?: boolean;
    mode?: number | false;
    chown?: { uid: number; gid: number } | false;
    tmpfileCreated?: (tmpfile: string) => void | Promise<void>;
  };

  function writeFileAtomic(
    filename: string,
    data: string | Buffer,
    options?: WriteFileAtomicOptions | BufferEncoding,
  ): Promise<void>;

  export = writeFileAtomic;
}
