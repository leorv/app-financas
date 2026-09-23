declare module 'pdfmake/build/pdfmake' {
  interface PdfMakeDocument {
    download(fileName?: string): Promise<void>;
    getBlob(): Promise<Blob>;
    getBuffer(): Promise<Uint8Array>;
  }

  interface PdfMakeBrowser {
    createPdf(definition: unknown, options?: unknown): PdfMakeDocument;
    addVirtualFileSystem?(vfs: unknown): void;
  }

  const pdfMake: PdfMakeBrowser;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const virtualFileSystem: Record<string, unknown>;
  export default virtualFileSystem;
}
