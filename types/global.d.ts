// Global type definitions for LEX Extension

declare global {
  interface Window {
    pdfjsLib?: any;
    lexExtension?: {
      version: string;
      initialized: boolean;
    };
  }
}

// PDF.js types
declare module 'pdfjs-dist' {
  export interface PDFDocumentProxy {
    numPages: number;
    fingerprint: string;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    getMetadata(): Promise<PDFMetadata>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
    render(params: RenderParameters): RenderTask;
  }

  export interface TextContent {
    items: TextItem[];
  }

  export interface TextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    fontName: string;
  }

  export interface PDFMetadata {
    info: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: string;
      ModDate?: string;
      PDFFormatVersion?: string;
      IsEncrypted?: boolean;
    };
  }

  export interface RenderParameters {
    canvasContext: CanvasRenderingContext2D;
    viewport: PageViewport;
  }

  export interface PageViewport {
    width: number;
    height: number;
    scale: number;
  }

  export interface RenderTask {
    promise: Promise<void>;
    cancel(): void;
  }

  export interface LoadingTask {
    promise: Promise<PDFDocumentProxy>;
    destroy(): void;
  }

  export function getDocument(src: ArrayBuffer | Uint8Array | string): LoadingTask;
}

// Chrome Extension specific types
declare namespace chrome {
  namespace runtime {
    interface Port {
      name: string;
      onMessage: chrome.events.Event<(message: any) => void>;
      onDisconnect: chrome.events.Event<() => void>;
      postMessage(message: any): void;
      disconnect(): void;
    }
  }
}

export {};