// MOST Web Framework 2.0 Codename Blueshift BSD-3-Clause license Copyright (c) 2017-2022, THEMOST LP All rights reserved
import {DataAssociationMapping, DataContext, DataField} from "./types";
import {DataModelBase, SequentialEventEmitter} from "@themost/common";
import {DataQueryable} from "./data-queryable";
import {SyncSeriesEventEmitter} from '@themost/events';

export declare class DataModel extends SequentialEventEmitter implements DataModelBase {

    static load: SyncSeriesEventEmitter<{ target: DataModel }>;

    constructor(obj:any);

    name: string;
    hidden?: boolean;
    sealed?: boolean;
    abstract?: boolean;
    version: string;
    caching?: 'none' | 'always' | 'conditional';
    fields: Array<DataField>;
    eventListeners?: Array<any>;
    constraints?: Array<any>;
    views?: Array<any>;
    privileges?: Array<any>;
    context: DataContext;
    readonly sourceAdapter?: string;
    readonly viewAdapter?: string;
    silent(value?: boolean): this;
    readonly attributes?: Array<DataField>;
    readonly primaryKey: any;
    readonly attributeNames: Array<string>;
    readonly constraintCollection: Array<any>;

    getPrimaryKey(): DataField;
    isSilent(): boolean;
    getDataObjectType(): any;
    initialize(): void;
    clone(): DataModel;
    join(model: string): DataModel;
    where(attr: string): DataQueryable;
    where<T>(expr: (value: T, ...param: any) => any, params?: any): DataQueryable;
    search(text: string): DataQueryable;
    asQueryable(): DataQueryable;
    filter(params: any, callback?: (err?: Error, res?: DataQueryable) => void): void;
    filterAsync(params: any): Promise<DataQueryable>;
    find(obj: any):DataQueryable;
    select(...attr: any[]): DataQueryable;
    select<T>(expr: (value: T, ...param: any) => any, params?: any): DataQueryable;
    select<T,J>(expr: (value1: T, value2: J, ...param: any) => any, params?: any): DataQueryable;
    orderBy(attr: any): DataQueryable;
    orderBy<T>(expr: (value: T) => any): DataQueryable;
    orderByDescending(attr: any): DataQueryable;
    orderByDescending<T>(expr: (value: T) => any): DataQueryable;
    take(n: number): DataQueryable;
    getList():Promise<any>;
    skip(n: number): DataQueryable;
    base(): DataModel;
    convert<T>(obj: any): T;
    cast(obj: any, state: number): any;
    save(obj: any): Promise<any>;
    inferState(obj: any, callback: (err?: Error, res?: any) => void): void;
    inferStateAsync(obj: any): Promise<any>;
    getSuperTypes(): Array<string>;
    update(obj: any): Promise<any>;
    insert(obj: any): Promise<any>;
    remove(obj: any): Promise<any>;
    migrate(callback: (err?: Error, res?: boolean) => void): void;
    migrateAsync(): Promise<boolean>;
    key(): any;
    field(name: string): DataField;
    getDataView(name: string): any;
    inferMapping(name: string): DataAssociationMapping;
    validateForUpdate(obj: any): Promise<any>;
    validateForInsert(obj: any): Promise<any>;
    levels(value: number): DataQueryable;
    getSubTypes(): Array<string>;
    getReferenceMappings(deep?: boolean): Array<any>;
    getAttribute(name: string): DataField;
    getTypedItems(): Promise<any>;
    getItems(): Promise<any>;
    getTypedList():Promise<any>;
    upsert(obj: any | Array<any>): Promise<any>;
    upsert(obj: any | Array<any>, callback: (err?: Error, result?: any) => void): void;
    upsertAsync(obj: any | Array<any>): Promise<any>;
}
