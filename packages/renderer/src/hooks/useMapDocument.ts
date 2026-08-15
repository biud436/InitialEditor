import { useMemo } from 'react';
import { getMapDocumentService, MapDocumentService } from 'initial-editor';

/** 맵 문서 서비스 (내보내기, 불러오기, 새 맵) */
export function useMapDocument(): MapDocumentService {
  return useMemo(() => getMapDocumentService(), []);
}
