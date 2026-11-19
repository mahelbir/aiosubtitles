import 'sequelize';

declare module 'sequelize' {
  namespace Model {
    let notFoundMessage: string;
    let duplicateMessage: string;
    let foreignKeyMessage: string;
    const notFound: Error;

    function withScope(name: string, ...args: unknown[]): typeof Model;

    function findAllLocked(
      options: Record<string, unknown>,
      transaction: import('sequelize').Transaction,
    ): Promise<unknown[]>;

    function findOneLocked(
      options: Record<string, unknown>,
      transaction: import('sequelize').Transaction,
    ): Promise<unknown>;

    function findOneAndUpdate(
      findOptions?: Record<string, unknown>,
      updateValues?: Record<string, unknown>,
      useTransaction?: boolean,
    ): Promise<unknown>;
  }
}
