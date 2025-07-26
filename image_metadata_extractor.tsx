'use client';
import React, { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';

// TypeScript interfaces
interface ImageMetadata {
  filename: string;
  fileSize: number;
  mimeType: string;
  exif: Record<string, any>;
  iptc: Record<string, any>;
  xmp: Record<string, any>;
  processedAt: Date;
  id: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

interface ExifTag {
  [key: number]: string;
}

// Constants moved outside to reduce complexity
const EXIF_TAGS: ExifTag = {
  0x010F: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x011A: 'XResolution',
  0x011B: 'YResolution',
  0x0128: 'ResolutionUnit',
  0x0132: 'DateTime',
  0x013B: 'Artist',
  0x0213: 'YCbCrPositioning',
  0x8769: 'ExifIFDPointer',
  0x8825: 'GPSIFDPointer'
};

const TYPE_SIZES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8
};

const METADATA_ICONS: Record<string, string> = {
  'EXIF Data': '📷',
  'IPTC Data': '📝',
  'XMP Data': '🏷️'
};

// RegExp objects for better performance and SonarQube compliance
const XMP_TITLE_REGEX = /<dc:title[^>]*>([^<]+)<\/dc:title>/i;
const XMP_CREATOR_REGEX = /<dc:creator[^>]*>([^<]+)<\/dc:creator>/i;

// CSV headers as constant to reduce complexity
const CSV_HEADERS = [
  'filename', 'fileSize', 'mimeType', 'processedAt',
  'exif_make', 'exif_model', 'exif_dateTime', 'exif_orientation',
  'iptc_detected', 'xmp_detected', 'xmp_title', 'xmp_creator'
];

// Test definitions moved outside to reduce complexity
const TEST_DEFINITIONS = [
  {
    name: 'File size formatting',
    test: (formatFileSize: (bytes: number) => string) => formatFileSize(1024) === '1 KB'
  },
  {
    name: 'CSV escaping',
    test: (escapeCsvValue: (value: any) => string) => escapeCsvValue('test,value') === '"test,value"'
  },
  {
    name: 'Supported MIME types',
    test: (supportedMimeTypes: Set<string>) => supportedMimeTypes.has('image/jpeg')
  },
  {
    name: 'Type sizes',
    test: () => getTypeSize(3) === 2
  }
];

// Styles object
const styles = {
  container: {
    margin: 0,
    boxSizing: 'border-box' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#f8f9fa',
    minHeight: '100vh',
    padding: '20px',
  },
  metadataExtractor: {
    maxWidth: '1200px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    overflow: 'hidden' as const,
  },
  header: {
    background: 'linear-gradient(135deg, #007bff, #0056b3)',
    color: 'white',
    padding: '30px',
    textAlign: 'center' as const,
  },
  headerTitle: {
    fontSize: '2.5rem',
    marginBottom: '10px',
    fontWeight: 700,
    margin: '0 0 10px 0',
  },
  headerDescription: {
    opacity: 0.9,
    fontSize: '1.1rem',
    margin: 0,
  },
  content: {
    padding: '30px',
  },
  uploadZoneContainer: {
    marginBottom: '30px',
  },
  uploadZone: {
    border: '3px dashed #007bff',
    borderRadius: '12px',
    padding: '50px',
    textAlign: 'center' as const,
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    background: '#f8f9ff',
    width: '100%',
    fontSize: 'inherit',
    fontFamily: 'inherit',
  },
  uploadZoneHover: {
    borderColor: '#0056b3',
    background: '#e6f3ff',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 25px rgba(0,123,255,0.15)',
  },
  uploadIcon: {
    fontSize: '4rem',
    marginBottom: '20px',
    color: '#007bff',
  },
  uploadButton: {
    background: 'linear-gradient(135deg, #007bff, #0056b3)',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 15px rgba(0,123,255,0.3)',
  },
  fileInput: {
    display: 'none',
  },
  controls: {
    display: 'flex',
    gap: '15px',
    marginBottom: '30px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  exportButton: {
    background: 'linear-gradient(135deg, #28a745, #1e7e34)',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 3px 10px rgba(40,167,69,0.3)',
  },
  exportButtonDisabled: {
    background: '#6c757d',
    cursor: 'not-allowed',
    opacity: 0.6,
    transform: 'none',
    boxShadow: 'none',
  },
  clearButton: {
    background: 'linear-gradient(135deg, #dc3545, #c82333)',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 3px 10px rgba(220,53,69,0.3)',
  },
  testButton: {
    background: 'linear-gradient(135deg, #6f42c1, #5a32a3)',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 3px 10px rgba(111,66,193,0.3)',
    marginLeft: 'auto',
  },
  status: {
    marginBottom: '30px',
    padding: '15px 20px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #e9ecef, #dee2e6)',
    borderLeft: '4px solid #007bff',
    fontWeight: 500,
  },
  statusProcessing: {
    background: 'linear-gradient(135deg, #fff3cd, #ffeaa7)',
    borderLeftColor: '#ffc107',
  },
  metadataGrid: {
    display: 'grid',
    gap: '25px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
  },
  metadataCard: {
    border: '1px solid #dee2e6',
    borderRadius: '12px',
    padding: '25px',
    background: 'white',
    boxShadow: '0 4px 6px rgba(0,0,0,0.07)',
    transition: 'all 0.3s ease',
  },
  metadataHeader: {
    fontWeight: 700,
    fontSize: '1.1rem',
    marginBottom: '15px',
    paddingBottom: '12px',
    borderBottom: '2px solid #007bff',
    color: '#007bff',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  metadataSection: {
    marginBottom: '20px',
  },
  metadataSectionTitle: {
    margin: '0 0 10px 0',
    color: '#495057',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    fontWeight: 600,
  },
  metadataContent: {
    fontFamily: '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", monospace',
    fontSize: '12px',
    background: 'linear-gradient(135deg, #f8f9fa, #e9ecef)',
    padding: '15px',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '250px',
    overflowY: 'auto' as const,
    border: '1px solid #dee2e6',
    lineHeight: 1.5,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: '#6c757d',
  },
  emptyStateIcon: {
    fontSize: '4rem',
    marginBottom: '20px',
    opacity: 0.5,
  },
  footer: {
    textAlign: 'center' as const,
    padding: '20px',
    background: '#f8f9fa',
    borderTop: '1px solid #dee2e6',
    color: '#6c757d',
    fontSize: '0.9rem',
  },
  processing: {
    opacity: 0.7,
    pointerEvents: 'none' as const,
  },
};

// Helper functions to reduce cognitive complexity
const getTypeSize = (type: number): number => TYPE_SIZES[type] || 1;

const generateUniqueId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// NEW: Helper functions for getTagValue to reduce cognitive complexity
const calculateActualOffset = (
  dataView: DataView,
  valueOffset: number,
  type: number,
  count: number,
  tiffOffset: number,
  isBigEndian: boolean
): number => {
  if (getTypeSize(type) * count > 4) {
    return tiffOffset + (isBigEndian ? 
      dataView.getUint32(valueOffset) : 
      dataView.getUint32(valueOffset, true));
  }
  return valueOffset;
};

const readUint16Value = (dataView: DataView, offset: number, isBigEndian: boolean): number => {
  return isBigEndian ? 
    dataView.getUint16(offset) : 
    dataView.getUint16(offset, true);
};

const readUint32Value = (dataView: DataView, offset: number, isBigEndian: boolean): number => {
  return isBigEndian ? 
    dataView.getUint32(offset) : 
    dataView.getUint32(offset, true);
};

const readAsciiString = (dataView: DataView, offset: number, count: number): string => {
  let str = '';
  for (let i = 0; i < Math.min(count - 1, 100); i++) {
    str += String.fromCharCode(dataView.getUint8(offset + i));
  }
  return str;
};

const readRationalValue = (dataView: DataView, offset: number, isBigEndian: boolean): number => {
  const numerator = readUint32Value(dataView, offset, isBigEndian);
  const denominator = readUint32Value(dataView, offset + 4, isBigEndian);
  return denominator !== 0 ? numerator / denominator : 0;
};

// UPDATED: Refactored getTagValue function with reduced cognitive complexity
const getTagValue = (
  dataView: DataView, 
  valueOffset: number, 
  type: number, 
  count: number, 
  tiffOffset: number, 
  isBigEndian: boolean
): any => {
  const actualOffset = calculateActualOffset(dataView, valueOffset, type, count, tiffOffset, isBigEndian);

  switch (type) {
    case 1: {
      return dataView.getUint8(actualOffset);
    }
    case 2: {
      return readAsciiString(dataView, actualOffset, count);
    }
    case 3: {
      return readUint16Value(dataView, actualOffset, isBigEndian);
    }
    case 4: {
      return readUint32Value(dataView, actualOffset, isBigEndian);
    }
    case 5: {
      return readRationalValue(dataView, actualOffset, isBigEndian);
    }
    default: {
      return null;
    }
  }
};

// Separate function to process individual IFD entry
const processIfdEntry = (
  dataView: DataView,
  tagOffset: number,
  tiffOffset: number,
  isBigEndian: boolean,
  exifData: Record<string, any>
) => {
  const tag = isBigEndian ? 
    dataView.getUint16(tagOffset) : 
    dataView.getUint16(tagOffset, true);
  
  const type = isBigEndian ? 
    dataView.getUint16(tagOffset + 2) : 
    dataView.getUint16(tagOffset + 2, true);
    
  const count = isBigEndian ? 
    dataView.getUint32(tagOffset + 4) : 
    dataView.getUint32(tagOffset + 4, true);

  if (EXIF_TAGS[tag]) {
    try {
      const value = getTagValue(dataView, tagOffset + 8, type, count, tiffOffset, isBigEndian);
      exifData[EXIF_TAGS[tag]] = value;
    } catch (error) {
      console.warn(`Error reading tag ${EXIF_TAGS[tag]}:`, error);
    }
  }
};

const parseIfd = (
  dataView: DataView, 
  ifdOffset: number, 
  tiffOffset: number, 
  isBigEndian: boolean, 
  exifData: Record<string, any>
) => {
  const tagCount = isBigEndian ? 
    dataView.getUint16(ifdOffset) : 
    dataView.getUint16(ifdOffset, true);

  for (let i = 0; i < Math.min(tagCount, 50); i++) {
    const tagOffset = ifdOffset + 2 + (i * 12);
    processIfdEntry(dataView, tagOffset, tiffOffset, isBigEndian, exifData);
  }
};

// Separate function to find EXIF marker
const findExifMarker = (dataView: DataView): number => {
  for (let i = 0; i < dataView.byteLength - 1; i++) {
    if (dataView.getUint8(i) === 0xFF && dataView.getUint8(i + 1) === 0xE1) {
      const exifHeaderOffset = i + 4;
      
      if (dataView.getUint32(exifHeaderOffset) === 0x45786966 && 
          dataView.getUint16(exifHeaderOffset + 4) === 0x0000) {
        return exifHeaderOffset;
      }
    }
  }
  return -1;
};

const extractExifData = (dataView: DataView): Record<string, any> => {
  const exifData: Record<string, any> = {};
  
  try {
    const exifHeaderOffset = findExifMarker(dataView);
    
    if (exifHeaderOffset !== -1) {
      const tiffOffset = exifHeaderOffset + 6;
      const isBigEndian = dataView.getUint16(tiffOffset) === 0x4D4D;
      
      exifData.byteOrder = isBigEndian ? 'Big Endian' : 'Little Endian';
      
      const ifd0Offset = tiffOffset + (isBigEndian ? 
        dataView.getUint32(tiffOffset + 4) : 
        dataView.getUint32(tiffOffset + 4, true));
      
      parseIfd(dataView, ifd0Offset, tiffOffset, isBigEndian, exifData);
    }
  } catch (error) {
    console.warn('Error extracting EXIF data:', error);
    exifData.error = 'Failed to parse EXIF data';
  }

  return exifData;
};

const findIptcMarkers = (dataView: DataView): boolean => {
  for (let i = 0; i < Math.min(dataView.byteLength - 1, 32768); i++) {
    if ((dataView.getUint8(i) === 0xFF && dataView.getUint8(i + 1) === 0xED) ||
        (dataView.getUint8(i) === 0xFF && dataView.getUint8(i + 1) === 0xE2)) {
      return true;
    }
  }
  return false;
};

const extractXmpMetadata = (xmpContent: string): Record<string, any> => {
  const xmpData: Record<string, any> = {};
  
  const titleMatch = XMP_TITLE_REGEX.exec(xmpContent);
  if (titleMatch) {
    xmpData.title = titleMatch[1];
  }
  
  const creatorMatch = XMP_CREATOR_REGEX.exec(xmpContent);
  if (creatorMatch) {
    xmpData.creator = creatorMatch[1];
  }
  
  return xmpData;
};

// Separate function to process XMP packet
const processXmpPacket = (fileString: string): Record<string, any> => {
  const xmpData: Record<string, any> = {};
  const xmpStart = fileString.indexOf('<?xpacket begin=');
  const xmpEnd = fileString.indexOf('<?xpacket end=');
  
  if (xmpStart !== -1 && xmpEnd !== -1) {
    const xmpContent = fileString.substring(xmpStart, xmpEnd + 20);
    const truncatedContent = xmpContent.substring(0, 500);
    xmpData.rawXMP = truncatedContent + '...';
    xmpData.detected = true;
    
    const extractedMetadata = extractXmpMetadata(xmpContent);
    Object.assign(xmpData, extractedMetadata);
  } else {
    xmpData.detected = false;
    xmpData.note = 'No XMP packet found in image';
  }
  
  return xmpData;
};

// Separate function to convert buffer to string
const convertBufferToString = (arrayBuffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(arrayBuffer);
  let fileString = '';
  
  const searchLength = Math.min(arrayBuffer.byteLength, 65536);
  for (let i = 0; i < searchLength; i++) {
    fileString += String.fromCharCode(uint8Array[i]);
  }
  
  return fileString;
};

// Create row data for CSV export
const createCsvRow = (metadata: ImageMetadata, escapeCsvValue: (value: any) => string): any[] => [
  escapeCsvValue(metadata.filename),
  metadata.fileSize,
  escapeCsvValue(metadata.mimeType),
  metadata.processedAt.toISOString(),
  escapeCsvValue(metadata.exif.Make || ''),
  escapeCsvValue(metadata.exif.Model || ''),
  escapeCsvValue(metadata.exif.DateTime || ''),
  metadata.exif.Orientation || '',
  metadata.iptc.detected || false,
  metadata.xmp.detected || false,
  escapeCsvValue(metadata.xmp.title || ''),
  escapeCsvValue(metadata.xmp.creator || '')
];

const ImageMetadataExtractor: React.FC = () => {
  // State management
  const [extractedMetadata, setExtractedMetadata] = useState<ImageMetadata[]>([]);
  const [status, setStatus] = useState('Ready to process images. Select files to begin extraction.');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Constants
  const supportedMimeTypes = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/tif'
  ]);

  // Utility functions
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const escapeCsvValue = useCallback((value: any): string => {
    if (typeof value !== 'string') return value;
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }, []);

  const downloadFile = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const extractIptcData = useCallback((dataView: DataView): Record<string, any> => {
    const iptcData: Record<string, any> = {};
    
    try {
      const hasIptcMarkers = findIptcMarkers(dataView);
      
      if (hasIptcMarkers) {
        iptcData.detected = true;
        iptcData.note = 'IPTC data detected but requires specialized parser for full extraction';
      } else {
        iptcData.detected = false;
        iptcData.note = 'No IPTC data found';
      }
    } catch (error) {
      console.warn('Error extracting IPTC data:', error);
      iptcData.error = 'Failed to parse IPTC data';
    }

    return iptcData;
  }, []);

  const extractXmpData = useCallback((arrayBuffer: ArrayBuffer): Record<string, any> => {
    const xmpData: Record<string, any> = {};
    
    try {
      const fileString = convertBufferToString(arrayBuffer);
      const processedXmpData = processXmpPacket(fileString);
      Object.assign(xmpData, processedXmpData);
    } catch (error) {
      console.warn('Error extracting XMP data:', error);
      xmpData.error = 'Failed to parse XMP data';
    }

    return xmpData;
  }, []);

  const extractTiffExifData = useCallback((dataView: DataView): Record<string, any> => {
    const exifData: Record<string, any> = {};
    
    try {
      const byteOrder = dataView.getUint16(0);
      const isBigEndian = byteOrder === 0x4D4D;
      
      exifData.byteOrder = isBigEndian ? 'Big Endian (MM)' : 'Little Endian (II)';
      
      const magicNumber = isBigEndian ? 
        dataView.getUint16(2) : 
        dataView.getUint16(2, true);
      
      if (magicNumber === 42) {
        exifData.format = 'Valid TIFF';
        
        const ifd0Offset = isBigEndian ? 
          dataView.getUint32(4) : 
          dataView.getUint32(4, true);
        
        parseIfd(dataView, ifd0Offset, 0, isBigEndian, exifData);
      } else {
        exifData.error = 'Invalid TIFF magic number';
      }
      
    } catch (error) {
      console.warn('Error extracting TIFF EXIF data:', error);
      exifData.error = 'Failed to parse TIFF EXIF data';
    }

    return exifData;
  }, []);

  const extractBasicImageInfo = useCallback((file: File): Record<string, any> => {
    return {
      note: `Limited metadata support for ${file.type}`,
      lastModified: new Date(file.lastModified).toISOString(),
      fileFormat: file.type,
      supportedExtraction: 'Basic file information only'
    };
  }, []);

  // Determine metadata extraction method based on file type
  const determineExtractionMethod = useCallback((file: File) => {
    const fileType = file.type.toLowerCase();
    
    if (fileType.includes('jpeg') || fileType.includes('jpg')) {
      return 'jpeg';
    } else if (fileType.includes('tiff')) {
      return 'tiff';
    } else {
      return 'basic';
    }
  }, []);

  // Extract metadata based on file type
  const extractMetadataByType = useCallback((
    arrayBuffer: ArrayBuffer, 
    dataView: DataView, 
    file: File, 
    extractionMethod: string
  ): Pick<ImageMetadata, 'exif' | 'iptc' | 'xmp'> => {
    const result = { exif: {}, iptc: {}, xmp: {} };
    
    switch (extractionMethod) {
      case 'jpeg':
        result.exif = extractExifData(dataView);
        result.iptc = extractIptcData(dataView);
        result.xmp = extractXmpData(arrayBuffer);
        break;
      case 'tiff':
        result.exif = extractTiffExifData(dataView);
        break;
      default:
        result.exif = extractBasicImageInfo(file);
        break;
    }
    
    return result;
  }, [extractIptcData, extractXmpData, extractTiffExifData, extractBasicImageInfo]);

  // Main metadata extraction function
  const extractMetadata = useCallback(async (file: File): Promise<ImageMetadata> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const dataView = new DataView(arrayBuffer);
          
          const baseMetadata = {
            filename: file.name,
            fileSize: file.size,
            mimeType: file.type,
            processedAt: new Date(),
            id: generateUniqueId()
          };

          const extractionMethod = determineExtractionMethod(file);
          const extractedData = extractMetadataByType(arrayBuffer, dataView, file, extractionMethod);
          
          const metadata: ImageMetadata = {
            ...baseMetadata,
            ...extractedData
          };

          resolve(metadata);
          
        } catch (error) {
          reject(new Error(`Failed to extract metadata from ${file.name}: ${(error as Error).message}`));
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  }, [determineExtractionMethod, extractMetadataByType]);

  // Process individual file
  const processFile = useCallback(async (file: File, index: number, total: number) => {
    setStatus(`Processing ${file.name} (${index + 1}/${total})...`);
    const metadata = await extractMetadata(file);
    setExtractedMetadata(prev => [...prev, metadata]);
    await new Promise(resolve => setTimeout(resolve, 10));
    return metadata;
  }, [extractMetadata]);

  // File handling
  const processFiles = useCallback(async (validFiles: File[]) => {
    const newMetadata: ImageMetadata[] = [];
    
    for (let i = 0; i < validFiles.length; i++) {
      const metadata = await processFile(validFiles[i], i, validFiles.length);
      newMetadata.push(metadata);
    }
    
    return newMetadata;
  }, [processFile]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => 
      supportedMimeTypes.has(file.type.toLowerCase())
    );

    if (validFiles.length === 0) {
      setStatus('No valid image files selected. Please choose JPEG, PNG, or TIFF files.');
      return;
    }

    setExtractedMetadata([]);
    setStatus(`Processing ${validFiles.length} image(s)...`);
    setIsProcessing(true);

    try {
      await processFiles(validFiles);
      const successMessage = `Successfully processed ${validFiles.length} image(s). Metadata extracted and ready for export.`;
      setStatus(`✅ ${successMessage}`);
    } catch (error) {
      console.error('Error processing files:', error);
      setStatus(`❌ Error processing files: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [processFiles, supportedMimeTypes]);

  // Event handlers
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  // Export functions
  const exportAsJson = useCallback(() => {
    if (extractedMetadata.length === 0) {
      setStatus('No metadata to export');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      imageCount: extractedMetadata.length,
      metadata: extractedMetadata,
      exportedBy: 'React Image Metadata Extractor v1.0.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const filename = `image-metadata-${Date.now()}.json`;
    downloadFile(blob, filename);
    setStatus(`✅ JSON export completed for ${extractedMetadata.length} image(s)`);
  }, [extractedMetadata, downloadFile]);

  const exportAsCsv = useCallback(() => {
    if (extractedMetadata.length === 0) {
      setStatus('No metadata to export');
      return;
    }

    const rows = extractedMetadata.map(metadata => createCsvRow(metadata, escapeCsvValue));

    const csvContent = [
      CSV_HEADERS.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const filename = `image-metadata-${Date.now()}.csv`;
    downloadFile(blob, filename);
    setStatus(`✅ CSV export completed for ${extractedMetadata.length} image(s)`);
  }, [extractedMetadata, escapeCsvValue, downloadFile]);

  const clearAll = useCallback(() => {
    setExtractedMetadata([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setStatus('All data cleared. Ready to process new images.');
  }, []);

  // Test functionality
  const executeTest = useCallback((
    test: any, 
    formatFileSize: (bytes: number) => string,
    escapeCsvValue: (value: any) => string,
    supportedMimeTypes: Set<string>
  ): TestResult => {
    try {
      let result = false;
      
      if (test.name === 'File size formatting') {
        result = test.test(formatFileSize);
      } else if (test.name === 'CSV escaping') {
        result = test.test(escapeCsvValue);
      } else if (test.name === 'Supported MIME types') {
        result = test.test(supportedMimeTypes);
      } else {
        result = test.test();
      }
      
      return { name: test.name, passed: result, error: null };
    } catch (error) {
      return { 
        name: test.name, 
        passed: false, 
        error: (error as Error).message 
      };
    }
  }, []);

  const runTests = useCallback(async () => {
    const originalStatus = status;
    setStatus('🧪 Running tests...');
    setIsProcessing(true);
    
    const testResults: TestResult[] = [];
    
    const allTests = [
      ...TEST_DEFINITIONS,
      {
        name: 'Metadata array initialization',
        test: () => Array.isArray(extractedMetadata)
      }
    ];

    for (const test of allTests) {
      const result = executeTest(test, formatFileSize, escapeCsvValue, supportedMimeTypes);
      testResults.push(result);
    }

    const passed = testResults.filter(r => r.passed).length;
    const total = testResults.length;
    
    const resultText = testResults.map(r => {
      const status = r.passed ? '✅' : '❌';
      const errorInfo = r.error ? ` (${r.error})` : '';
      return `${status} ${r.name}${errorInfo}`;
    }).join('\n');
    
    const testSummary = `🧪 Test Results: ${passed}/${total} passed`;
    const fullMessage = `${testSummary}\n\n${resultText}`;
    alert(fullMessage);
    
    setStatus(originalStatus);
    setIsProcessing(false);
  }, [status, formatFileSize, escapeCsvValue, extractedMetadata, supportedMimeTypes, executeTest]);

  // Render metadata section
  const renderMetadataSection = useCallback((title: string, data: Record<string, any>) => {
    const icon = METADATA_ICONS[title] || '📄';
    
    if (!data || Object.keys(data).length === 0) {
      const titleLowercase = title.toLowerCase();
      const noDataMessage = `No ${titleLowercase} found`;
      
      return (
        <div style={styles.metadataSection} key={title}>
          <h4 style={styles.metadataSectionTitle}>
            {icon} {title}
          </h4>
          <div style={styles.metadataContent}>
            {noDataMessage}
          </div>
        </div>
      );
    }

    const formattedData = JSON.stringify(data, null, 2);
    
    return (
      <div style={styles.metadataSection} key={title}>
        <h4 style={styles.metadataSectionTitle}>
          {icon} {title}
        </h4>
        <div style={styles.metadataContent}>
          {formattedData}
        </div>
      </div>
    );
  }, []);

  // File info component
  const renderFileInfo = useCallback((metadata: ImageMetadata) => {
    const fileSizeText = `File Size: ${formatFileSize(metadata.fileSize)}`;
    const mimeTypeText = `MIME Type: ${metadata.mimeType}`;
    const processedText = `Processed: ${metadata.processedAt.toLocaleString()}`;
    const browserText = `Browser: ${navigator.userAgent.split(' ')[0]}`;
    
    const fileInfo = [fileSizeText, mimeTypeText, processedText, browserText].join('\n');

    return (
      <div style={styles.metadataSection}>
        <h4 style={styles.metadataSectionTitle}>📊 File Information</h4>
        <div style={styles.metadataContent}>
          {fileInfo}
        </div>
      </div>
    );
  }, [formatFileSize]);

  // Render metadata card header
  const renderMetadataCardHeader = useCallback((metadata: ImageMetadata) => {
    const fileSizeFormatted = formatFileSize(metadata.fileSize);
    const headerInfo = `${fileSizeFormatted} • ${metadata.mimeType}`;
    
    return (
      <div style={styles.metadataHeader}>
        <span>📄 {metadata.filename}</span>
        <div style={{ 
          fontWeight: 'normal', 
          fontSize: '12px', 
          color: '#6c757d', 
          marginTop: '4px' 
        }}>
          {headerInfo}
        </div>
      </div>
    );
  }, [formatFileSize]);

  // Main render
  return (
    <div style={styles.container}>
      <div style={styles.metadataExtractor}>
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>🖼️ Image Metadata Extractor</h1>
          <p style={styles.headerDescription}>
            Extract EXIF, IPTC, and XMP metadata from your images locally in your browser
          </p>
        </div>
        
        <div style={{...styles.content, ...(isProcessing ? styles.processing : {})}}>
          <div style={styles.uploadZoneContainer}>
            <button
              style={{
                ...styles.uploadZone,
                ...(isDragOver ? styles.uploadZoneHover : {})
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              aria-label="Upload zone for image files - click to select files or drag and drop"
            >
              <div style={styles.uploadIcon}>📁</div>
              <div>
                <p style={{ fontSize: '1.2rem', marginBottom: '10px', fontWeight: 600 }}>
                  Drop images here or click to choose
                </p>
                <span style={styles.uploadButton}>
                  Choose Images
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={styles.fileInput}
                  multiple
                  accept="image/jpeg,image/jpg,image/png,image/tiff,image/tif"
                  onChange={handleFileInputChange}
                  aria-label="File input for images"
                />
              </div>
              <p style={{ marginTop: '20px', color: '#6c757d', fontSize: '0.9rem' }}>
                Supports JPEG, PNG, TIFF • Multiple files • No server upload • Privacy protected
              </p>
            </button>
          </div>
          
          <div style={styles.controls}>
            <button 
              style={{
                ...styles.exportButton,
                ...(extractedMetadata.length === 0 ? styles.exportButtonDisabled : {})
              }}
              onClick={exportAsJson}
              disabled={extractedMetadata.length === 0}
              aria-label="Export metadata as JSON file"
            >
              📄 Export JSON
            </button>
            <button 
              style={{
                ...styles.exportButton,
                ...(extractedMetadata.length === 0 ? styles.exportButtonDisabled : {})
              }}
              onClick={exportAsCsv}
              disabled={extractedMetadata.length === 0}
              aria-label="Export metadata as CSV file"
            >
              📊 Export CSV
            </button>
            <button 
              style={styles.clearButton} 
              onClick={clearAll}
              aria-label="Clear all processed metadata"
            >
              🗑️ Clear All
            </button>
            <button 
              style={styles.testButton} 
              onClick={runTests}
              aria-label="Run application tests"
            >
              🧪 Run Tests
            </button>
          </div>
          
          <div style={{
            ...styles.status,
            ...(isProcessing ? styles.statusProcessing : {})
          }}>
            {status}
          </div>
          
          <div style={styles.metadataGrid}>
            {extractedMetadata.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyStateIcon}>📷</div>
                <p>No images processed yet. Upload images to see their metadata.</p>
              </div>
            ) : (
              extractedMetadata.map((metadata) => (
                <div key={metadata.id} style={styles.metadataCard}>
                  {renderMetadataCardHeader(metadata)}
                  {renderMetadataSection('EXIF Data', metadata.exif)}
                  {renderMetadataSection('IPTC Data', metadata.iptc)}
                  {renderMetadataSection('XMP Data', metadata.xmp)}
                  {renderFileInfo(metadata)}
                </div>
              ))
            )}
          </div>
        </div>
        
        <div style={styles.footer}>
          <p>🔒 All processing happens locally in your browser. No data is sent to any server.</p>
        </div>
      </div>
    </div>
  );
};

export default ImageMetadataExtractor;
