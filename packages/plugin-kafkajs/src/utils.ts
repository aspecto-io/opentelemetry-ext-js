import { IHeaders } from "kafkajs";

export const getHeaderAsString = (carrier: IHeaders, key: string) => {
  if (!carrier) return undefined;

  const val = carrier[key];
  if (!val) return val;

  return val.toString();
};
