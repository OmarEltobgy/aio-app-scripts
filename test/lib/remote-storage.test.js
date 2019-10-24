/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { vol } = global.mockFs()

const RemoteStorage = require('../../lib/remote-storage')
const aws = require('aws-sdk')

function spyS3 (funcs) {
  const newFuncs = {}
  // fake .promise() instead
  Object.keys(funcs).forEach(name => {
    newFuncs[name] = (...args) => Object({ promise: funcs[name].bind(null, ...args) })
  })
  return jest.spyOn(aws, 'S3').mockImplementation(() => {
    return newFuncs
  })
}

beforeEach(() => {
  // restores all spies
  jest.restoreAllMocks()
  global.cleanFs(vol)
})

test('Constructor should throw when missing credentials', async () => {
  const instantiate = () => new RemoteStorage({})
  expect(instantiate.bind(this)).toThrowWithMessageContaining(['required'])
})

test('folderExists should return false if there are no files', async () => {
  spyS3({ listObjectsV2: () => Object({ Contents: [] }) })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  expect((await rs.folderExists('fakeprefix'))).toBe(false)
})

test('folderExists should return true if there are files', async () => {
  spyS3({ listObjectsV2: () => Object({ Contents: ['fakeprefix/index.html'] }) })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  expect((await rs.folderExists('fakeprefix'))).toBe(true)
})

test('emptyFolder should not throw if there are no files', async () => {
  spyS3({ listObjectsV2: () => Object({ Contents: [] }) })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  expect(rs.emptyFolder.bind(rs, 'fakeprefix')).not.toThrow()
})

test('emptyFolder should not call S3#deleteObjects if already empty', async () => {
  const deleteMock = jest.fn()
  spyS3({
    listObjectsV2: () => Object({ Contents: [] }),
    deleteObjects: deleteMock
  })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.emptyFolder('fakeprefix')
  expect(deleteMock).toHaveBeenCalledTimes(0)
})

test('emptyFolder should call S3#deleteObjects with correct parameters with one file', async () => {
  const deleteMock = jest.fn()
  const content = [{ Key: 'fakeprefix/index.html' }]
  spyS3({
    listObjectsV2: () => Object({ Contents: content }),
    deleteObjects: deleteMock
  })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.emptyFolder('fakeprefix')
  expect(deleteMock).toHaveBeenCalledWith({ Delete: { Objects: content } })
})

test('emptyFolder should call S3#deleteObjects with correct parameters with multiple files', async () => {
  const deleteMock = jest.fn()
  const content = [{ Key: 'fakeprefix/index.html' }, { Key: 'fakeprefix/index.css' }, { Key: 'fakeprefix/index.css' }]
  spyS3({
    listObjectsV2: () => Object({ Contents: content }),
    deleteObjects: deleteMock
  })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.emptyFolder('fakeprefix')
  expect(deleteMock).toHaveBeenCalledWith({ Delete: { Objects: content } })
})

test('uploadFile should call S3#upload with the correct parameters', async () => {
  global.addFakeFiles(vol, 'fakeDir', ['index.js'])
  const uploadMock = jest.fn()
  spyS3({
    upload: uploadMock
  })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.uploadFile('fakeDir/index.js', 'fakeprefix')
  const body = Buffer.from('fake content', 'utf8')
  expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ Key: 'fakeprefix/index.js', Body: body }))
})

test('uploadDir should call S3#upload one time per file', async () => {
  await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html'])
  const uploadMock = jest.fn()
  spyS3({
    upload: uploadMock
  })
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.uploadDir('fakeDir', 'fakeprefix')
  expect(uploadMock).toHaveBeenCalledTimes(3)
})

test('uploadDir should call a callback once per uploaded file', async () => {
  await global.addFakeFiles(vol, 'fakeDir', ['index.js', 'index.css', 'index.html'])
  const uploadMock = jest.fn()
  spyS3({
    upload: uploadMock
  })
  const cbMock = jest.fn()
  const rs = new RemoteStorage(global.fakeTVMResponse)
  await rs.uploadDir('fakeDir', 'fakeprefix', cbMock)
  expect(cbMock).toHaveBeenCalledTimes(3)
})
