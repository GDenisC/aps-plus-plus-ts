export const serverStartTime = Date.now();
export const getTime = () => Date.now() - serverStartTime;
export const arrayRemoveAt = <T>(array: T[], index: number) => {
    array.splice(index, 1);
}
export { Logger } from './logger';