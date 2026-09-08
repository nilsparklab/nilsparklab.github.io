export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;
export const routes = Object.freeze({ health:`${API_PREFIX}/health`, status:`${API_PREFIX}/status`, study:`${API_PREFIX}/study`, books:`${API_PREFIX}/books`, dictionary:`${API_PREFIX}/dictionary`, search:`${API_PREFIX}/search` });
export const notConfigured = Object.freeze({ status:503, body:{ok:false,error:'SERVICE_NOT_CONFIGURED',message:'This service is not configured yet.'} });
