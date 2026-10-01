export function makeTxRecorder(selectResults: any[][] = [], insertResults: any[] = []) {
  const calls: string[] = [];
  // setCalls: cada objeto pasado a un .set(...) en la cadena, en orden. El
  // recorder original solo registraba NOMBRES de metodo (calls), nunca los
  // argumentos -- insuficiente para probar QUE campos toca un .update().set()
  // (ej. I6: procesarLotePendientesCorreo no debe incluir `intentos`/`estado`
  // cuando el error es de configuracion, no de envio real). Aditivo y
  // retro-compatible: los tests existentes que solo desestructuran { tx, calls }
  // siguen funcionando igual, y la cadena sigue resolviendo lo mismo que antes.
  const setCalls: any[] = [];
  let selectIndex = 0;
  let insertIndex = 0;

  function makeChain(methodName: string): any {
    return new Proxy(function () {}, {
      get(_target, prop: string) {
        if (prop === "then") {
          const isSelect = methodName === "select" || methodName === "selectDistinct";
          const isInsert = methodName === "insert";
          let result: any;
          if (isSelect) {
            result = selectResults[selectIndex++] ?? [];
          } else if (isInsert) {
            result = [insertResults[insertIndex++] ?? { insertId: 1 }];
          } else {
            result = undefined;
          }
          return (resolve: (value: any) => void) => resolve(result);
        }
        return (...args: any[]) => {
          if (prop === "set" && args.length > 0) setCalls.push(args[0]);
          return makeChain(methodName);
        };
      },
    });
  }

  // Target es un objeto plano, no `function(){}` -- `tx` nunca se invoca
  // como funcion, solo se le leen metodos (tx.select, tx.insert, ...). Un
  // target funcion trae props propias (name/length/prototype) que
  // `hasOwnProperty` de abajo detectaba como "override explicito" y
  // devolvia el valor real de Function.prototype en vez del closure de
  // tracking -- inofensivo mientras ningun metodo real de Drizzle se
  // llame asi, pero un objeto plano cierra la fuga de raiz.
  const tx: any = new Proxy({}, {
    get(target, prop: string) {
      // Si el test reasigno explicitamente tx.<metodo> = vi.fn(...) (via el
      // Proxy's default `set` behavior, que escribe en `target`), respetar
      // ese override en vez de siempre sintetizar el closure de tracking --
      // sin esto, reasignar tx.insert para simular un error (ej.
      // ER_DUP_ENTRY) era un no-op silencioso.
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return (target as any)[prop];
      }
      return () => {
        calls.push(prop);
        return makeChain(prop);
      };
    },
  });

  return { tx, calls, setCalls };
}
